import { defineAction } from "@agent-native/core/action";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { ownerOf } from "../server/lib/contests.js";
import { zoneArg } from "../server/lib/schemas.js";
import { deadlineInfo, parseStatus, rankNextUp } from "../shared/contest-logic.js";

export default defineAction({
  description:
    "What to work on now: open contests ranked by urgency × prize × fit × remaining work, each with its first unfinished step. Excludes submitted, skipped and closed contests.",
  schema: z.object({
    limit: z.coerce.number().int().min(1).max(20).default(5).describe("How many to return; defaults to 5"),
    displayZone: zoneArg,
  }),
  http: { method: "GET" },
  readOnly: true,
  outputSchema: z.object({
    items: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        status: z.string(),
        priority: z.number(),
        hoursLeft: z.number(),
        deadlineLocal: z.string(),
        why: z.string(),
        nextStep: z.object({ id: z.string(), title: z.string() }).nullable(),
      }),
    ),
  }),
  run: async ({ limit, displayZone }, ctx) => {
    const owner = ownerOf(ctx);
    const db = getDb();
    const c = schema.contests;
    const s = schema.contestSteps;
    const rows = await db
      .select({ id: c.id, title: c.title, status: c.status, deadlineUtc: c.deadlineUtc, prizeUsd: c.prizeUsd, fitScore: c.fitScore })
      .from(c)
      .where(eq(c.ownerEmail, owner));
    const ids = rows.map((r) => r.id);
    const steps = ids.length
      ? await db
          .select({ id: s.id, contestId: s.contestId, title: s.title, done: s.done })
          .from(s)
          .where(and(eq(s.ownerEmail, owner), inArray(s.contestId, ids)))
          .orderBy(asc(s.position))
      : [];
    const now = new Date();
    const ranked = rankNextUp(
      rows.map((r) => {
        const mine = steps.filter((st) => st.contestId === r.id);
        return { ...r, status: parseStatus(r.status), stepsDone: mine.filter((m) => m.done).length, stepsTotal: mine.length };
      }),
      now,
    ).slice(0, limit);
    return {
      items: ranked.map((r) => {
        const next = steps.find((st) => st.contestId === r.id && !st.done);
        return {
          id: r.id,
          title: r.title,
          status: r.status,
          priority: r.priority,
          hoursLeft: r.hoursLeft,
          deadlineLocal: deadlineInfo(r.deadlineUtc, displayZone, now).local,
          why: r.why,
          nextStep: next ? { id: next.id, title: next.title } : null,
        };
      }),
    };
  },
});
