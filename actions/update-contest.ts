import { defineAction, fail } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { loadContest, loadSteps, ownerOf, present } from "../server/lib/contests.js";
import { boolArg, contestOut, statusEnum, zoneArg } from "../server/lib/schemas.js";
import { canTransition, parseStatus, scoreFit, wallClockToUtc } from "../shared/contest-logic.js";

export default defineAction({
  description:
    "Update any fields of a contest (patch), including moving it between statuses scouting → eligible → building → submitted (or skipped). Illegal status jumps fail with errorCode illegal_transition. The fit score is recomputed.",
  schema: z.object({
    id: z.string().describe("Contest id"),
    title: z.string().min(1).optional().describe("New title"),
    url: z.string().optional().describe("New URL"),
    prizeUsd: z.coerce.number().int().min(0).optional().describe("Prize in USD"),
    deadline: z.string().optional().describe('New deadline wall-clock "YYYY-MM-DDTHH:mm" in deadlineZone'),
    deadlineZone: z.string().optional().describe("IANA zone for deadline"),
    status: statusEnum.optional().describe("New status: scouting, eligible, building, submitted or skipped"),
    free: boolArg.optional().describe("Free to enter"),
    soloOk: boolArg.optional().describe("Solo allowed"),
    aiAllowed: boolArg.optional().describe("AI tools allowed"),
    effortHours: z.coerce.number().int().min(1).optional().describe("Estimated hours of work"),
    requirements: z.string().optional().describe("Requirements text"),
    notes: z.string().optional().describe("Notes (replaces existing)"),
    displayZone: zoneArg,
  }),
  http: { method: "PUT" },
  outputSchema: contestOut,
  run: async ({ id, displayZone, deadline, ...patch }, ctx) => {
    const owner = ownerOf(ctx);
    const current = await loadContest(id, owner);
    if (patch.status && !canTransition(parseStatus(current.status), patch.status)) {
      fail(`Cannot move "${current.title}" from ${current.status} to ${patch.status}.`, {
        errorCode: "illegal_transition",
        details: { from: current.status, to: patch.status },
      });
    }
    const zone = patch.deadlineZone ?? current.deadlineZone;
    let deadlineUtc = current.deadlineUtc;
    if (deadline) {
      try {
        deadlineUtc = wallClockToUtc(deadline, zone).toISOString();
      } catch {
        fail(`Could not read deadline "${deadline}" in ${zone}.`, { errorCode: "invalid_deadline" });
      }
    }
    const merged = { ...current, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)), deadlineUtc };
    const fit = scoreFit(merged);
    const c = schema.contests;
    await getDb()
      .update(c)
      .set({
        title: merged.title,
        url: merged.url,
        prizeUsd: merged.prizeUsd,
        deadlineUtc,
        deadlineZone: zone,
        status: merged.status,
        free: merged.free,
        soloOk: merged.soloOk,
        aiAllowed: merged.aiAllowed,
        effortHours: merged.effortHours,
        requirements: merged.requirements,
        notes: merged.notes,
        fitScore: fit.score,
      })
      .where(and(eq(c.id, id), eq(c.ownerEmail, owner)));
    return present(await loadContest(id, owner), await loadSteps(id, owner), displayZone);
  },
});
