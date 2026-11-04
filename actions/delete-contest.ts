import { defineAction } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { loadContest, ownerOf } from "../server/lib/contests.js";

export default defineAction({
  description: "Delete a contest and its checklist from the board. Prefer status skipped to keep history.",
  schema: z.object({ id: z.string().describe("Contest id") }),
  http: { method: "DELETE" },
  outputSchema: z.object({ id: z.string(), deleted: z.literal(true) }),
  run: async ({ id }, ctx) => {
    const owner = ownerOf(ctx);
    await loadContest(id, owner);
    const db = getDb();
    await db.delete(schema.contestSteps).where(and(eq(schema.contestSteps.contestId, id), eq(schema.contestSteps.ownerEmail, owner)));
    await db.delete(schema.contests).where(and(eq(schema.contests.id, id), eq(schema.contests.ownerEmail, owner)));
    return { id, deleted: true as const };
  },
});
