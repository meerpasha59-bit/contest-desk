import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { loadContest, loadSteps, ownerOf, present } from "../server/lib/contests.js";
import { contestOut, zoneArg } from "../server/lib/schemas.js";

export default defineAction({
  description: "Get one contest with its checklist, deadline in displayZone and fit score.",
  schema: z.object({ id: z.string().describe("Contest id"), displayZone: zoneArg }),
  http: { method: "GET" },
  readOnly: true,
  outputSchema: contestOut,
  run: async ({ id, displayZone }, ctx) => {
    const owner = ownerOf(ctx);
    const row = await loadContest(id, owner);
    return present(row, await loadSteps(id, owner), displayZone);
  },
});
