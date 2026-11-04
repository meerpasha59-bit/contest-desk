import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { loadContest, loadSteps, ownerOf, present } from "../server/lib/contests.js";
import { contestOut, zoneArg } from "../server/lib/schemas.js";

export default defineAction({
  description: "Append a custom step to a contest's checklist.",
  schema: z.object({
    id: z.string().describe("Contest id"),
    title: z.string().min(1).describe("Step text"),
    displayZone: zoneArg,
  }),
  outputSchema: contestOut,
  run: async ({ id, title, displayZone }, ctx) => {
    const owner = ownerOf(ctx);
    const contest = await loadContest(id, owner);
    const steps = await loadSteps(id, owner);
    const position = steps.length ? Math.max(...steps.map((s) => s.position)) + 1 : 0;
    await getDb().insert(schema.contestSteps).values({ id: crypto.randomUUID(), contestId: id, position, title, ownerEmail: owner });
    return present(contest, await loadSteps(id, owner), displayZone);
  },
});
