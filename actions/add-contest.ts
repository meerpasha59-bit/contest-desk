import { defineAction, fail } from "@agent-native/core/action";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { DEFAULT_ZONE, loadContest, loadSteps, ownerOf, present } from "../server/lib/contests.js";
import { boolArg, contestOut, statusEnum, zoneArg } from "../server/lib/schemas.js";
import { generatePlan, scoreFit, wallClockToUtc } from "../shared/contest-logic.js";

export default defineAction({
  description:
    "Add a contest/hackathon/bounty to the board. Deadline is a wall-clock time in the organiser's zone (e.g. 2026-11-09T23:59 + America/Los_Angeles); the fit score and, by default, a step checklist from the requirements are computed automatically.",
  schema: z.object({
    title: z.string().min(1).describe("Contest name"),
    url: z.string().default("").describe("Official page URL"),
    prizeUsd: z.coerce.number().int().min(0).default(0).describe("Total cash prize pool in USD; 0 if none"),
    deadline: z
      .string()
      .describe('Deadline as wall-clock "YYYY-MM-DDTHH:mm" in deadlineZone, or an ISO instant with offset'),
    deadlineZone: z.string().default("UTC").describe('IANA zone the organiser stated, e.g. "America/Los_Angeles"; defaults to "UTC"'),
    status: statusEnum.default("scouting").describe('Initial status; defaults to "scouting"'),
    free: boolArg.default(true).describe("Free to enter (no fee); defaults to true"),
    soloOk: boolArg.default(true).describe("Solo entries allowed; defaults to true"),
    aiAllowed: boolArg.default(true).describe("AI tools allowed; defaults to true"),
    effortHours: z.coerce.number().int().min(1).default(8).describe("Estimated hours of work; defaults to 8"),
    requirements: z.string().default("").describe("Submission requirements, one per line"),
    notes: z.string().default("").describe("Free-form notes"),
    withPlan: boolArg.default(true).describe("Generate the step checklist from requirements; defaults to true"),
    displayZone: zoneArg,
  }),
  outputSchema: contestOut,
  run: async (args, ctx) => {
    const owner = ownerOf(ctx);
    let deadlineUtc: string;
    try {
      deadlineUtc = wallClockToUtc(args.deadline, args.deadlineZone).toISOString();
    } catch {
      fail(`Could not read deadline "${args.deadline}" in ${args.deadlineZone}.`, { errorCode: "invalid_deadline" });
    }
    const fit = scoreFit({ ...args, deadlineUtc: deadlineUtc! });
    const id = crypto.randomUUID();
    const db = getDb();
    await db.insert(schema.contests).values({
      id,
      title: args.title,
      url: args.url,
      prizeUsd: args.prizeUsd,
      deadlineUtc: deadlineUtc!,
      deadlineZone: args.deadlineZone,
      status: args.status,
      free: args.free,
      soloOk: args.soloOk,
      aiAllowed: args.aiAllowed,
      effortHours: args.effortHours,
      fitScore: fit.score,
      requirements: args.requirements,
      notes: args.notes,
      ownerEmail: owner,
    });
    if (args.withPlan) {
      const plan = generatePlan(args.requirements);
      await db.insert(schema.contestSteps).values(
        plan.map((p, i) => ({ id: crypto.randomUUID(), contestId: id, position: i, title: p.title, ownerEmail: owner })),
      );
    }
    const row = await loadContest(id, owner);
    return present(row, await loadSteps(id, owner), args.displayZone || DEFAULT_ZONE);
  },
});
