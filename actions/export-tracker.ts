import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { zoneArg } from "../server/lib/schemas.js";
import { exportMarkdown } from "../shared/contest-logic.js";
import listContests from "./list-contests.js";

export default defineAction({
  description: "Export the whole board as a Markdown tracker grouped by status, with deadlines in displayZone and checklists.",
  schema: z.object({ displayZone: zoneArg }),
  http: { method: "GET" },
  readOnly: true,
  outputSchema: z.object({ markdown: z.string(), count: z.number() }),
  run: async ({ displayZone }, ctx) => {
    const { contests } = await listContests.run({ displayZone }, ctx);
    return { markdown: exportMarkdown(contests, displayZone), count: contests.length };
  },
});
