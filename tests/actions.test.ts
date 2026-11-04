import { getDbExec } from "@agent-native/core/db";
import { beforeAll, describe, expect, it } from "vitest";

import addContest from "../actions/add-contest";
import addStep from "../actions/add-step";
import convertDeadline from "../actions/convert-deadline";
import deleteContest from "../actions/delete-contest";
import exportTracker from "../actions/export-tracker";
import generatePlanAction from "../actions/generate-plan";
import getContest from "../actions/get-contest";
import listContests from "../actions/list-contests";
import nextUp from "../actions/next-up";
import scoreFitAction from "../actions/score-fit";
import seedDemo from "../actions/seed-demo-contests";
import toggleStep from "../actions/toggle-step";
import updateContest from "../actions/update-contest";
import { MIGRATIONS } from "../server/db/migrations";

const ctx = { userEmail: "tester@example.com" } as any;
const other = { userEmail: "someone-else@example.com" } as any;
const zone = "Asia/Kolkata";

const base = {
  url: "https://example.com",
  prizeUsd: 0,
  deadlineZone: "UTC",
  status: "scouting" as const,
  free: true,
  soloOk: true,
  aiAllowed: true,
  effortHours: 8,
  requirements: "",
  notes: "",
  withPlan: true,
  displayZone: zone,
};

beforeAll(async () => {
  const exec = getDbExec();
  for (const m of MIGRATIONS) {
    const sql = typeof m.sql === "string" ? m.sql : m.sql.postgres!;
    for (const stmt of sql.split(/;\s*\n/)) if (stmt.trim()) await exec.execute(stmt);
  }
});

describe("contest actions (PGlite)", () => {
  let id = "";

  it("add-contest converts the deadline, scores fit and generates a plan", async () => {
    const c = await addContest.run(
      {
        ...base,
        title: "Agent-Native Hackathon",
        prizeUsd: 10000,
        deadline: "2099-11-09T23:59",
        deadlineZone: "America/Los_Angeles",
        requirements: "Public GitHub repo\nRecord a Clips demo under 3 minutes",
      },
      ctx,
    );
    id = c.id;
    expect(c.deadlineUtc).toBe("2099-11-10T07:59:00.000Z");
    expect(c.deadline.local).toContain("13:29");
    expect(c.fitScore).toBeGreaterThanOrEqual(90);
    expect(c.stepsTotal).toBeGreaterThanOrEqual(4);
    expect(c.steps[0].title).toBe("Read the official rules and eligibility");
  });

  it("rejects an unreadable deadline", async () => {
    await expect(addContest.run({ ...base, title: "Bad", deadline: "soon" }, ctx)).rejects.toThrow(/deadline/i);
  });

  it("list/get are scoped to the owner", async () => {
    expect((await listContests.run({ displayZone: zone }, ctx)).contests.map((c) => c.id)).toContain(id);
    expect((await listContests.run({ displayZone: zone }, other)).contests).toHaveLength(0);
    await expect(getContest.run({ id, displayZone: zone }, other)).rejects.toThrow(/not found/);
  });

  it("update-contest enforces the status machine", async () => {
    const c = await updateContest.run({ id, status: "building", displayZone: zone }, ctx);
    expect(c.status).toBe("building");
    await updateContest.run({ id, status: "submitted", displayZone: zone }, ctx);
    await expect(updateContest.run({ id, status: "scouting", displayZone: zone }, ctx)).rejects.toThrow(/Cannot move/);
    await updateContest.run({ id, status: "building", displayZone: zone }, ctx);
  });

  it("update-contest recomputes fit when entry becomes paid", async () => {
    const before = (await getContest.run({ id, displayZone: zone }, ctx)).fitScore!;
    const after = await updateContest.run({ id, free: false, displayZone: zone }, ctx);
    expect(after.fitScore!).toBeLessThan(before);
    expect((await scoreFitAction.run({ id }, ctx)).verdict).toBe("pass");
    await updateContest.run({ id, free: true, displayZone: zone }, ctx);
  });

  it("toggle-step, add-step and generate-plan keep the checklist consistent", async () => {
    const c = await getContest.run({ id, displayZone: zone }, ctx);
    const t = await toggleStep.run({ stepId: c.steps[0].id, done: true }, ctx);
    expect(t.done).toBe(true);
    await expect(toggleStep.run({ stepId: c.steps[0].id, done: false }, other)).rejects.toThrow(/not found/);
    const withStep = await addStep.run({ id, title: "Ask a friend to test", displayZone: zone }, ctx);
    expect(withStep.stepsTotal).toBe(c.stepsTotal + 1);
    const regenerated = await generatePlanAction.run({ id, replace: false, displayZone: zone }, ctx);
    expect(regenerated.stepsTotal).toBe(withStep.stepsTotal); // nothing duplicated
    expect(regenerated.stepsDone).toBe(1);
    const replaced = await generatePlanAction.run({ id, replace: true, displayZone: zone }, ctx);
    expect(replaced.stepsDone).toBe(0);
    expect(replaced.steps.some((s) => s.title === "Ask a friend to test")).toBe(false);
  });

  it("next-up ranks the urgent one first and names its next step", async () => {
    const soon = new Date(Date.now() + 20 * 3600000).toISOString();
    const urgent = await addContest.run({ ...base, title: "Urgent jam", prizeUsd: 1000, deadline: soon, effortHours: 4 }, ctx);
    const { items } = await nextUp.run({ limit: 5, displayZone: zone }, ctx);
    expect(items[0].id).toBe(urgent.id);
    expect(items[0].nextStep?.title).toBe("Read the official rules and eligibility");
  });

  it("convert-deadline and export-tracker", async () => {
    const d = await convertDeadline.run({ deadline: "2099-11-09T23:59", fromZone: "America/Los_Angeles", displayZone: zone }, ctx);
    expect(d.utc).toBe("2099-11-10T07:59:00.000Z");
    const { markdown, count } = await exportTracker.run({ displayZone: zone }, ctx);
    expect(count).toBe(2);
    expect(markdown).toContain("## Building (1)");
    expect(markdown).toContain("Agent-Native Hackathon");
  });

  it("seed-demo-contests skips a non-empty board, delete-contest removes", async () => {
    expect(await seedDemo.run({ force: false }, ctx)).toEqual({ added: 0, skipped: true });
    const fresh = { userEmail: "new@example.com" } as any;
    expect((await seedDemo.run({ force: false }, fresh)).added).toBe(4);
    expect((await listContests.run({ displayZone: zone }, fresh)).contests).toHaveLength(4);
    await deleteContest.run({ id }, ctx);
    await expect(getContest.run({ id, displayZone: zone }, ctx)).rejects.toThrow(/not found/);
  });
});

describe("auth", () => {
  it("refuses to run without a signed-in user", async () => {
    await expect(listContests.run({ displayZone: zone }, {} as any)).rejects.toThrow(/Sign in/);
  });
});
