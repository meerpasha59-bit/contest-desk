import { getOrgContext } from "@agent-native/core/org";
import {
  createAgentChatPlugin,
  loadActionsFromStaticRegistry,
} from "@agent-native/core/server";

import actionsRegistry from "../../.generated/actions-registry.js";

const INITIAL_TOOL_NAMES = [
  "view-screen",
  "navigate",
  "list-contests",
  "get-contest",
  "add-contest",
  "update-contest",
  "next-up",
  "generate-plan",
  "add-step",
  "toggle-step",
  "convert-deadline",
  "score-fit",
  "provider-api-request",
  "ask-question",
];

export default createAgentChatPlugin({
  appId: "contest-desk",
  actions: loadActionsFromStaticRegistry(actionsRegistry),
  mcp: { connectorCatalog: [], appApprovalPage: true },
  initialToolNames: INITIAL_TOOL_NAMES,
  resolveOrgId: async (event) => (await getOrgContext(event)).orgId,
  systemPrompt: `You are the Contest Desk agent: you help one person find, judge, plan and finish hackathons, bounties and contests on a shared board.

The board (route /board, selected contest at /board/<id>) and you use the same actions, so anything you change appears on the user's screen immediately. The current screen tells you which contest is selected (navigation.contestId); "this one" means that contest.

Rules:
- Never do time-zone math yourself. Use convert-deadline, and store deadlines with add-contest/update-contest as the organiser's wall-clock time plus their IANA zone.
- Fit is deterministic: use score-fit to explain it rather than inventing a score. Paid entry, team-only, closed, or not enough time are hard passes.
- When asked what to do, call next-up and name the top contest's first unfinished step.
- Keep checklists concrete: generate-plan from requirements, then add-step for anything specific. Tick steps with toggle-step only when the user says they are done.
- Move status with update-contest (scouting → eligible → building → submitted, or skipped). Never mark something submitted unless the user confirms it was submitted.
- Never invent prizes, deadlines or rules. If you cannot read the official page, say so.`,
});
