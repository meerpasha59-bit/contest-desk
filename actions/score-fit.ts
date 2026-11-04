import { defineAction, fail } from "@agent-native/core/action";
import { z } from "zod";

import { loadContest, ownerOf } from "../server/lib/contests.js";
import { boolArg } from "../server/lib/schemas.js";
import { scoreFit } from "../shared/contest-logic.js";

export default defineAction({
  description:
    "Explain the deterministic fit score (0-100, verdict go/maybe/pass) for a saved contest by id, or for a what-if contest given its fields. Hard blockers: paid entry, team-only, closed, or less time left than the work needs.",
  schema: z.object({
    id: z.string().optional().describe("Saved contest id; omit to score the what-if fields below"),
    prizeUsd: z.coerce.number().min(0).optional().describe("What-if prize in USD"),
    deadlineUtc: z.string().optional().describe("What-if deadline as an ISO instant"),
    free: boolArg.optional().describe("What-if free to enter"),
    soloOk: boolArg.optional().describe("What-if solo allowed"),
    aiAllowed: boolArg.optional().describe("What-if AI allowed"),
    effortHours: z.coerce.number().min(1).optional().describe("What-if hours of work"),
  }),
  http: { method: "GET" },
  readOnly: true,
  outputSchema: z.object({
    score: z.number(),
    verdict: z.enum(["go", "maybe", "pass"]),
    reasons: z.array(z.string()),
    parts: z.object({ prize: z.number(), time: z.number(), cost: z.number(), solo: z.number(), ai: z.number() }),
  }),
  run: async (args, ctx) => {
    if (args.id) return scoreFit(await loadContest(args.id, ownerOf(ctx)));
    if (!args.deadlineUtc) fail("Give an id, or at least deadlineUtc for a what-if score.", { errorCode: "missing_input" });
    return scoreFit({
      prizeUsd: args.prizeUsd ?? 0,
      deadlineUtc: args.deadlineUtc!,
      free: args.free ?? true,
      soloOk: args.soloOk ?? true,
      aiAllowed: args.aiAllowed ?? true,
      effortHours: args.effortHours,
    });
  },
});
