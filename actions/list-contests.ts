import { defineAction } from "@agent-native/core/action";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { ownerOf, present } from "../server/lib/contests.js";
import { contestOut, statusEnum, zoneArg } from "../server/lib/schemas.js";

export default defineAction({
  description:
    "List contests on the board with deadlines converted to displayZone, countdowns, fit scores and checklist progress. Optionally filter by status.",
  schema: z.object({
    status: statusEnum.optional().describe("Only this status; omit for all"),
    displayZone: zoneArg,
  }),
  http: { method: "GET" },
  readOnly: true,
  outputSchema: z.object({ contests: z.array(contestOut) }),
  run: async ({ status, displayZone }, ctx) => {
    const owner = ownerOf(ctx);
    const c = schema.contests;
    const s = schema.contestSteps;
    const db = getDb();
    const rows = await db
      .select()
      .from(c)
      .where(status ? and(eq(c.ownerEmail, owner), eq(c.status, status)) : eq(c.ownerEmail, owner))
      .orderBy(asc(c.deadlineUtc))
      .limit(500);
    const ids = rows.map((r) => r.id);
    const steps = ids.length
      ? await db
          .select({ id: s.id, title: s.title, done: s.done, position: s.position, contestId: s.contestId })
          .from(s)
          .where(and(eq(s.ownerEmail, owner), inArray(s.contestId, ids)))
          .orderBy(asc(s.position))
      : [];
    const now = new Date();
    return {
      contests: rows.map((r) =>
        present(
          r,
          steps.filter((st) => st.contestId === r.id).map(({ contestId: _c, ...rest }) => rest),
          displayZone,
          now,
        ),
      ),
    };
  },
});
