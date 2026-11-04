import { defineAction, fail } from "@agent-native/core/action";
import { z } from "zod";

import { deadlineOut, zoneArg } from "../server/lib/schemas.js";
import { deadlineInfo, wallClockToUtc } from "../shared/contest-logic.js";

export default defineAction({
  description:
    'Convert a deadline stated in one time zone (e.g. "2026-11-09T23:59" America/Los_Angeles) into displayZone, with hours left and a countdown. Use this instead of mental math whenever a rule page gives a deadline.',
  schema: z.object({
    deadline: z.string().describe('Wall-clock "YYYY-MM-DDTHH:mm" (or date only = 23:59) in fromZone, or an ISO instant with offset'),
    fromZone: z.string().default("UTC").describe('Zone the deadline is stated in; defaults to "UTC"'),
    displayZone: zoneArg,
  }),
  http: { method: "GET" },
  readOnly: true,
  outputSchema: deadlineOut,
  run: async ({ deadline, fromZone, displayZone }) => {
    try {
      return deadlineInfo(wallClockToUtc(deadline, fromZone), displayZone);
    } catch (e) {
      fail(`Could not convert "${deadline}" from ${fromZone}: ${(e as Error).message}`, { errorCode: "invalid_deadline" });
    }
  },
});
