import { defineAction } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { loadContest, loadSteps, ownerOf, present } from "../server/lib/contests.js";
import { boolArg, contestOut, zoneArg } from "../server/lib/schemas.js";
import { generatePlan } from "../shared/contest-logic.js";

export default defineAction({
  description:
    "Turn a contest's requirements text into an ordered step checklist (deterministic). replace=true wipes the existing checklist; otherwise only missing steps are appended. To refine, update requirements first or add-step.",
  schema: z.object({
    id: z.string().describe("Contest id"),
    replace: boolArg.default(false).describe("Replace the current checklist; defaults to false"),
    displayZone: zoneArg,
  }),
  outputSchema: contestOut,
  run: async ({ id, replace, displayZone }, ctx) => {
    const owner = ownerOf(ctx);
    const contest = await loadContest(id, owner);
    const db = getDb();
    const s = schema.contestSteps;
    if (replace) await db.delete(s).where(and(eq(s.contestId, id), eq(s.ownerEmail, owner)));
    const existing = replace ? [] : await loadSteps(id, owner);
    const have = new Set(existing.map((e) => e.title.toLowerCase()));
    const fresh = generatePlan(contest.requirements).filter((p) => !have.has(p.title.toLowerCase()));
    if (fresh.length) {
      const start = existing.length;
      await db.insert(s).values(
        fresh.map((p, i) => ({ id: crypto.randomUUID(), contestId: id, position: start + i, title: p.title, ownerEmail: owner })),
      );
    }
    return present(contest, await loadSteps(id, owner), displayZone);
  },
});
