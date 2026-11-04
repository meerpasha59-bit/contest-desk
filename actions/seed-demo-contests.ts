import { defineAction } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { ownerOf } from "../server/lib/contests.js";
import addContest from "./add-contest.js";

const DEMO = [
  {
    title: "Builder.io Agent-Native Hackathon",
    url: "https://www.builder.io/hackathon",
    prizeUsd: 10000,
    deadline: "2026-11-09T23:59",
    deadlineZone: "America/Los_Angeles",
    status: "building" as const,
    effortHours: 16,
    requirements:
      "Build a functional app with Agent-Native\nRecord a public Clips demo under 3 minutes\nPublic GitHub repo encouraged\nDescription must list pre-existing work and templates",
  },
  {
    title: "Weekend Game Jam",
    url: "https://itch.io/jams",
    prizeUsd: 500,
    deadline: "2026-11-16T09:00",
    deadlineZone: "Europe/London",
    status: "eligible" as const,
    effortHours: 20,
    requirements: "Make a browser game on the theme\nUpload to itch.io\nPost a gameplay video",
  },
  {
    title: "Docs Bounty: fix 5 broken links",
    url: "https://github.com",
    prizeUsd: 100,
    deadline: "2026-11-30",
    deadlineZone: "UTC",
    status: "scouting" as const,
    effortHours: 2,
    requirements: "Open a pull request\nLink the issue in the description",
  },
  {
    title: "Paid-entry Pitch Contest",
    url: "https://example.com/pitch",
    prizeUsd: 2000,
    deadline: "2026-11-20T17:00",
    deadlineZone: "America/New_York",
    status: "scouting" as const,
    free: false,
    effortHours: 6,
    requirements: "Pitch deck\nEntry fee $49",
  },
];

export default defineAction({
  description: "Load four sample contests so a new board isn't empty. Skips when the board already has contests unless force=true.",
  schema: z.object({
    force: z.preprocess((v) => v === "true" || v === true, z.boolean()).default(false).describe("Add even if contests exist; defaults to false"),
  }),
  outputSchema: z.object({ added: z.number(), skipped: z.boolean() }),
  run: async ({ force }, ctx) => {
    const owner = ownerOf(ctx);
    const existing = await getDb().select({ id: schema.contests.id }).from(schema.contests).where(eq(schema.contests.ownerEmail, owner)).limit(1);
    if (existing.length && !force) return { added: 0, skipped: true };
    for (const d of DEMO) {
      await addContest.run(
        { free: true, soloOk: true, aiAllowed: true, notes: "", withPlan: true, displayZone: "Asia/Kolkata", ...d },
        ctx,
      );
    }
    return { added: DEMO.length, skipped: false };
  },
});
