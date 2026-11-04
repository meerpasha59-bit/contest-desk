import { defineAction, fail } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { ownerOf } from "../server/lib/contests.js";
import { boolArg } from "../server/lib/schemas.js";

export default defineAction({
  description: "Mark a checklist step done or not done.",
  schema: z.object({
    stepId: z.string().describe("Step id (from get-contest steps[].id)"),
    done: boolArg.describe("true = done, false = not done"),
  }),
  outputSchema: z.object({ stepId: z.string(), contestId: z.string(), done: z.boolean(), title: z.string() }),
  run: async ({ stepId, done }, ctx) => {
    const owner = ownerOf(ctx);
    const s = schema.contestSteps;
    const [row] = await getDb()
      .update(s)
      .set({ done })
      .where(and(eq(s.id, stepId), eq(s.ownerEmail, owner)))
      .returning({ contestId: s.contestId, title: s.title, done: s.done });
    if (!row) fail(`Step ${stepId} not found.`, { errorCode: "not_found", statusCode: 404 });
    return { stepId, contestId: row!.contestId, done: row!.done, title: row!.title };
  },
});
