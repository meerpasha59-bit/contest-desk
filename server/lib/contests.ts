import { fail } from "@agent-native/core/action";
import { and, asc, eq } from "drizzle-orm";

import { getDb, schema } from "../db/index.js";
import { deadlineInfo, parseStatus, type ContestStatus } from "../../shared/contest-logic.js";

export const DEFAULT_ZONE = "Asia/Kolkata";

/** Owner for row scoping. Every contest row belongs to the signed-in user. */
export function ownerOf(ctx: { userEmail?: string | null } | undefined): string {
  const email = ctx?.userEmail;
  if (!email) fail("Sign in to use your contest board.", { errorCode: "unauthenticated", statusCode: 401 });
  return email!;
}

export async function loadContest(id: string, owner: string) {
  const c = schema.contests;
  const [row] = await getDb()
    .select()
    .from(c)
    .where(and(eq(c.id, id), eq(c.ownerEmail, owner)))
    .limit(1);
  if (!row) fail(`Contest ${id} not found.`, { errorCode: "not_found", statusCode: 404 });
  return row!;
}

export async function loadSteps(contestId: string, owner: string) {
  const s = schema.contestSteps;
  return getDb()
    .select({ id: s.id, title: s.title, done: s.done, position: s.position })
    .from(s)
    .where(and(eq(s.contestId, contestId), eq(s.ownerEmail, owner)))
    .orderBy(asc(s.position));
}

export function present(
  row: typeof schema.contests.$inferSelect,
  steps: Array<{ id: string; title: string; done: boolean; position: number }>,
  displayZone: string,
  now = new Date(),
) {
  const status: ContestStatus = parseStatus(row.status);
  return {
    id: row.id,
    title: row.title,
    url: row.url,
    prizeUsd: row.prizeUsd,
    status,
    deadlineUtc: row.deadlineUtc,
    deadlineZone: row.deadlineZone,
    deadline: deadlineInfo(row.deadlineUtc, displayZone, now),
    free: row.free,
    soloOk: row.soloOk,
    aiAllowed: row.aiAllowed,
    effortHours: row.effortHours,
    fitScore: row.fitScore,
    requirements: row.requirements,
    notes: row.notes,
    steps,
    stepsDone: steps.filter((s) => s.done).length,
    stepsTotal: steps.length,
  };
}
