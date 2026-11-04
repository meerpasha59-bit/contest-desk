# Contest Desk

**A contest board you share with an AI agent.** Track hackathons, bounties and contests: see every deadline in *your* time zone, get a fit score that explains whether to enter, turn rules into a checklist, and always know what to work on next. You and the agent work on the same board through the same actions, so whatever one of you changes shows up for the other straight away.

Built for the [Builder.io Agent-Native Hackathon](https://www.builder.io/hackathon) on the open-source [Agent-Native](https://github.com/BuilderIO/agent-native) framework.

## The problem

When you enter many online contests, the tedious parts eat your time: working out what "11:59 PM PT" means where you live, re-reading rules to see if it's free, solo-friendly and AI-friendly, keeping a checklist of repos, videos and forms, and deciding which deadline to tackle first. Spreadsheets don't do time zones or priorities, and chatbots forget everything between chats.

## What it does

| | Human (UI) | Agent (chat sidebar) |
|---|---|---|
| **Add** | Form with organiser's deadline + zone | "Track this hackathon: <link>" → `add-contest` |
| **Deadlines** | Countdown chips coloured by urgency, shown in your browser's zone | `convert-deadline`. The agent is told never to do time-zone math in its head |
| **Should I enter?** | Fit score 0–100 on every card | `score-fit` explains it: prize, runway vs effort, free, solo, AI allowed. Paid, team-only or closed contests are hard passes |
| **Plan** | Checklist built from the requirements, tick steps off, add your own | `generate-plan`, `add-step` ("plan this one") |
| **Status** | Kanban: Scouting → Eligible → Building → Submitted / Skipped (enforced state machine) | `update-contest` (illegal jumps fail with `illegal_transition`) |
| **Focus** | "Next up" strip ranks open contests by urgency × prize × fit × work left | `next-up` ("what should I do now?") |
| **Share** | Export the board as Markdown | `export-tracker` |

The agent knows what's on your screen: with a contest open at `/board/<id>`, the navigation state includes `contestId`, so "is this one still open?" or "draft my description" works without copying anything. Every detail panel has one-click **Hand off to the agent** buttons that send the selected contest as context.

## Agent-Native pieces used

- **Actions as the single contract**: 13 `defineAction` files in `actions/` serve the React UI (`useActionQuery`/`useActionMutation`), the agent (tools), HTTP, CLI (`pnpm action next-up`) and MCP. All have Zod input and output schemas.
- **SQL source of truth**: `contests` and `contest_steps` tables (Drizzle + PGlite locally / Postgres in prod), with named additive migrations in `server/db/migrations.ts`. Every row is scoped to the signed-in user.
- **Shared app state**: `use-navigation-state.ts` publishes `view: "board"` and `contestId`; the `navigate` action can open a contest for the user.
- **Agent sidebar hand-off**: `sendToAgentChat` with contest context from the board.
- **Deterministic core**: all scoring, time-zone and planning logic is pure TypeScript in `shared/contest-logic.ts`. No LLM inside actions; the agent orchestrates them.

## Run it

Requires Node ≥ 22.22 and pnpm.

```bash
corepack enable
pnpm install
pnpm dev            # http://localhost:8080 → "Continue as local dev" → Contest board
```

On an empty board, click **Load examples** (or `AGENT_USER_EMAIL=local@localhost pnpm action seed-demo-contests`).
To chat with the agent, connect a model under Settings (Builder.io, Anthropic, OpenAI, or local Ollama). The board and every action work without a model.

CLI examples:

```bash
export AGENT_USER_EMAIL=local@localhost
pnpm action convert-deadline --deadline 2026-11-09T23:59 --fromZone America/Los_Angeles --displayZone Asia/Kolkata
pnpm action next-up --limit 3
pnpm action export-tracker
```

## Tests

```bash
pnpm test   # vitest: 28 tests
```

- `shared/contest-logic.test.ts`: DST-aware deadline conversion, countdowns, fit-score rubric and hard blockers, plan generation, status machine, next-up ranking, Markdown export.
- `tests/actions.test.ts`: the real actions against in-memory PGlite: owner scoping, state-machine enforcement, fit recompute, checklist consistency, next-up, export, seeding, and auth refusal.

`pnpm typecheck` and `pnpm agent-native:doctor` pass with no findings.

## Pre-existing work and what changed during the event

- **Scaffold:** generated with `npx @agent-native/core create --template chat` (Agent-Native Chat starter, MIT, by Builder.io). It provides the app shell, auth, chat sidebar, settings and framework plumbing. The original starter README is kept as `TEMPLATE_README.md`.
- **Written during the hackathon (from 2 Nov 2026):** everything Contest Desk-specific: `shared/contest-logic.ts` + tests, `server/db/*`, `server/plugins/db.ts`, `server/lib/*`, all actions except the starter's `hello`, `navigate`, `view-screen`, `run`, `provider-api-request` (with `navigate` extended for `contestId`), `app/routes/board.($contestId).tsx`, the sidebar link, navigation-state additions, agent system prompt and tool list, `tests/actions.test.ts`, and this README.
- Libraries: Agent-Native core/toolkit, React Router, Drizzle, Zod, Tabler icons, Tailwind, Vitest (all from the starter's dependencies). No third-party assets.

## License

MIT, see [LICENSE](LICENSE).
