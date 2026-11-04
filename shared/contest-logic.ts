/**
 * Contest Desk — pure, deterministic logic shared by actions, UI and tests.
 * No I/O, no LLM. Everything here is unit-tested in shared/contest-logic.test.ts.
 */

export const CONTEST_STATUSES = [
  "scouting",
  "eligible",
  "building",
  "submitted",
  "skipped",
] as const;
export type ContestStatus = (typeof CONTEST_STATUSES)[number];

export const STATUS_LABELS: Record<ContestStatus, string> = {
  scouting: "Scouting",
  eligible: "Eligible",
  building: "Building",
  submitted: "Submitted",
  skipped: "Skipped",
};

/** Allowed lifecycle transitions (small state machine). */
export const STATUS_TRANSITIONS: Record<ContestStatus, ContestStatus[]> = {
  scouting: ["eligible", "skipped", "building"],
  eligible: ["building", "skipped", "scouting"],
  building: ["submitted", "skipped", "eligible"],
  submitted: ["building"], // re-open to fix a submission
  skipped: ["scouting", "eligible"],
};

export function canTransition(from: ContestStatus, to: ContestStatus): boolean {
  return from === to || STATUS_TRANSITIONS[from].includes(to);
}

export function parseStatus(value: string): ContestStatus {
  if ((CONTEST_STATUSES as readonly string[]).includes(value)) {
    return value as ContestStatus;
  }
  throw new Error(`Unknown contest status: ${value}`);
}

// ---------------------------------------------------------------- deadlines

export interface DeadlineInfo {
  /** ISO instant in UTC. */
  utc: string;
  /** Wall-clock string in the requested display zone, e.g. "Tue 10 Nov 2026, 13:29". */
  local: string;
  timeZone: string;
  hoursLeft: number;
  isPast: boolean;
  /** "3d 4h", "5h 12m", "closed". */
  countdown: string;
  urgency: "closed" | "critical" | "soon" | "comfortable";
}

/**
 * Offset in minutes of `timeZone` from UTC at a given instant.
 */
export function zoneOffsetMinutes(timeZone: string, at: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(
    dtf.formatToParts(at).map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return Math.round((asUtc - at.getTime()) / 60000);
}

/**
 * Interpret a wall-clock time ("2026-11-09T23:59") in `timeZone` and return the UTC instant.
 * If the string already carries an offset or Z, it is parsed as-is.
 */
export function wallClockToUtc(wallClock: string, timeZone: string): Date {
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(wallClock)) {
    const d = new Date(wallClock);
    if (Number.isNaN(d.getTime())) throw new Error(`Invalid deadline: ${wallClock}`);
    return d;
  }
  const m = wallClock.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/,
  );
  if (!m) throw new Error(`Invalid deadline: ${wallClock}`);
  const [, y = "", mo = "", d = "", h = "23", mi = "59", s = "00"] = m;
  const guess = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s);
  // Two passes handle DST edges.
  let offset = zoneOffsetMinutes(timeZone, new Date(guess));
  let utc = guess - offset * 60000;
  offset = zoneOffsetMinutes(timeZone, new Date(utc));
  utc = guess - offset * 60000;
  return new Date(utc);
}

export function formatInZone(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(at);
}

export function formatCountdown(ms: number): string {
  if (ms <= 0) return "closed";
  const totalMin = Math.floor(ms / 60000);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function deadlineInfo(
  deadlineUtc: string | Date,
  displayZone: string,
  now: Date = new Date(),
): DeadlineInfo {
  const at = typeof deadlineUtc === "string" ? new Date(deadlineUtc) : deadlineUtc;
  if (Number.isNaN(at.getTime())) throw new Error("Invalid deadline instant");
  const ms = at.getTime() - now.getTime();
  const hoursLeft = Math.round((ms / 3600000) * 10) / 10;
  const urgency: DeadlineInfo["urgency"] =
    ms <= 0 ? "closed" : hoursLeft <= 24 ? "critical" : hoursLeft <= 72 ? "soon" : "comfortable";
  return {
    utc: at.toISOString(),
    local: formatInZone(at, displayZone),
    timeZone: displayZone,
    hoursLeft,
    isPast: ms <= 0,
    countdown: formatCountdown(ms),
    urgency,
  };
}

// ---------------------------------------------------------------- fit score

export interface FitInput {
  prizeUsd: number;
  deadlineUtc: string;
  free: boolean;
  soloOk: boolean;
  aiAllowed: boolean;
  /** Rough hours of work needed (default 8). */
  effortHours?: number | undefined;
}

export interface FitBreakdown {
  score: number; // 0..100
  verdict: "go" | "maybe" | "pass";
  reasons: string[];
  parts: { prize: number; time: number; cost: number; solo: number; ai: number };
}

/**
 * Deterministic 0–100 rubric. Hard blockers (paid entry, team-only, closed,
 * not enough time to do the work) cap the verdict at "pass".
 */
export function scoreFit(input: FitInput, now: Date = new Date()): FitBreakdown {
  const reasons: string[] = [];
  const effort = input.effortHours ?? 8;
  const hoursLeft = (new Date(input.deadlineUtc).getTime() - now.getTime()) / 3600000;

  // Prize: log scale, $10k+ → 35 pts.
  const prize =
    input.prizeUsd <= 0 ? 0 : Math.min(35, Math.round((Math.log10(input.prizeUsd) / 4) * 35));
  reasons.push(input.prizeUsd > 0 ? `Prize $${input.prizeUsd.toLocaleString("en-US")}` : "No cash prize");

  // Time: enough runway relative to effort → 25 pts.
  let time = 0;
  if (hoursLeft <= 0) reasons.push("Deadline passed");
  else {
    const ratio = hoursLeft / Math.max(1, effort);
    time = ratio >= 6 ? 25 : ratio >= 3 ? 20 : ratio >= 1.5 ? 12 : ratio >= 1 ? 5 : 0;
    reasons.push(
      ratio < 1
        ? `Only ${Math.max(0, Math.floor(hoursLeft))}h left for ~${effort}h of work`
        : `${Math.floor(hoursLeft)}h runway for ~${effort}h of work`,
    );
  }

  const cost = input.free ? 20 : 0;
  reasons.push(input.free ? "Free to enter" : "Costs money to enter");
  const solo = input.soloOk ? 10 : 0;
  reasons.push(input.soloOk ? "Solo entries OK" : "Team required");
  const ai = input.aiAllowed ? 10 : 0;
  reasons.push(input.aiAllowed ? "AI tools allowed" : "AI tools restricted");

  const raw = prize + time + cost + solo + ai;
  const blocked = hoursLeft <= 0 || !input.free || !input.soloOk || time === 0;
  // A hard blocker caps the score so it can never outrank a viable contest.
  const score = blocked ? Math.min(raw, 30) : raw;
  const verdict: FitBreakdown["verdict"] = blocked ? "pass" : score >= 70 ? "go" : score >= 45 ? "maybe" : "pass";
  return { score, verdict, reasons, parts: { prize, time, cost, solo, ai } };
}

// ---------------------------------------------------------------- plan generation

export interface PlanStep {
  title: string;
  /** Hours before the deadline this step should be done by (for ordering). */
  dueOffsetHours: number;
}

const KEYWORD_STEPS: Array<{ match: RegExp; step: string; offset: number }> = [
  { match: /\b(repo|github|source code|open[- ]source)\b/i, step: "Push a public repository with README and license", offset: 24 },
  { match: /\b(video|demo|record|clips?|loom|youtube)\b/i, step: "Record the demo video and check it plays without login", offset: 18 },
  { match: /\b(deploy|live|hosted|url)\b/i, step: "Deploy a live demo and test the public URL", offset: 20 },
  { match: /\b(slides?|deck|pitch)\b/i, step: "Prepare the slide deck", offset: 16 },
  { match: /\b(tweet|post|social|x\.com|twitter)\b/i, step: "Publish the social post with the required tag", offset: 10 },
  { match: /\b(write[- ]?up|description|readme|blog|article)\b/i, step: "Write the project description, noting pre-existing work", offset: 12 },
  { match: /\b(tests?|testing)\b/i, step: "Add tests and make them pass", offset: 30 },
];

/**
 * Turn a free-text requirements blob into an ordered checklist. Each line that
 * looks like a requirement becomes a step; common keywords add standard steps.
 * Always starts with "Read the rules" and ends with "Submit and confirm receipt".
 */
export function generatePlan(requirements: string): PlanStep[] {
  const first: PlanStep = { title: "Read the official rules and eligibility", dueOffsetHours: 1000 };
  const steps: PlanStep[] = [first];
  const seen = new Set<string>([first.title.toLowerCase()]);
  const add = (title: string, offset: number) => {
    const key = title.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      steps.push({ title, dueOffsetHours: offset });
    }
  };

  for (const k of KEYWORD_STEPS) if (k.match.test(requirements)) add(k.step, k.offset);

  const lines = requirements
    .split(/\n|;|•/)
    .map((l) => l.replace(/^\s*(?:[-*]|\d+[.)])\s*/, "").trim())
    .filter((l) => l.length >= 6 && l.length <= 160);
  for (const line of lines) {
    const covered = KEYWORD_STEPS.some((k) => k.match.test(line));
    if (!covered) add(line.charAt(0).toUpperCase() + line.slice(1).replace(/\.$/, ""), 40);
  }

  add("Build the core working flow", 48);
  add("Submit the entry and confirm receipt", 2);
  return steps.sort((a, b) => b.dueOffsetHours - a.dueOffsetHours);
}

// ---------------------------------------------------------------- next up

export interface NextUpCandidate {
  id: string;
  title: string;
  status: ContestStatus;
  deadlineUtc: string;
  prizeUsd: number;
  fitScore: number | null;
  stepsDone: number;
  stepsTotal: number;
}

export interface NextUpItem extends NextUpCandidate {
  priority: number;
  hoursLeft: number;
  why: string;
}

/**
 * Rank open contests by urgency × value × remaining work. Submitted, skipped
 * and closed contests are excluded.
 */
export function rankNextUp(items: NextUpCandidate[], now: Date = new Date()): NextUpItem[] {
  return items
    .filter((c) => c.status !== "submitted" && c.status !== "skipped")
    .map((c) => {
      const hoursLeft = (new Date(c.deadlineUtc).getTime() - now.getTime()) / 3600000;
      const urgency = hoursLeft <= 0 ? 0 : 1 / Math.max(1, hoursLeft / 24); // 1.0 within a day
      const value = Math.log10(Math.max(10, c.prizeUsd)) / 4; // ~1.0 at $10k
      const fit = (c.fitScore ?? 50) / 100;
      const remaining = c.stepsTotal === 0 ? 1 : 1 - c.stepsDone / c.stepsTotal;
      const statusBoost = c.status === "building" ? 1.2 : c.status === "eligible" ? 1.0 : 0.8;
      const priority = hoursLeft <= 0 ? 0 : Math.round(urgency * (0.5 + value) * (0.5 + fit) * (0.3 + remaining) * statusBoost * 1000) / 10;
      const why =
        hoursLeft <= 0
          ? "Deadline passed"
          : `${formatCountdown(hoursLeft * 3600000)} left · ${c.stepsTotal ? `${c.stepsDone}/${c.stepsTotal} steps` : "no plan yet"} · $${c.prizeUsd.toLocaleString("en-US")}`;
      return { ...c, priority, hoursLeft: Math.round(hoursLeft * 10) / 10, why };
    })
    .filter((c) => c.hoursLeft > 0)
    .sort((a, b) => b.priority - a.priority || a.hoursLeft - b.hoursLeft);
}

// ---------------------------------------------------------------- export

export interface ExportContest {
  title: string;
  url: string;
  status: ContestStatus;
  prizeUsd: number;
  deadlineUtc: string;
  fitScore: number | null;
  steps: Array<{ title: string; done: boolean }>;
}

export function exportMarkdown(contests: ExportContest[], displayZone: string, now: Date = new Date()): string {
  const out: string[] = [`# Contest Desk tracker`, ``, `Times shown in ${displayZone}.`, ``];
  for (const status of CONTEST_STATUSES) {
    const group = contests.filter((c) => c.status === status);
    if (!group.length) continue;
    out.push(`## ${STATUS_LABELS[status]} (${group.length})`, ``);
    for (const c of group) {
      const d = deadlineInfo(c.deadlineUtc, displayZone, now);
      out.push(
        `### [${c.title}](${c.url})`,
        `- Prize: $${c.prizeUsd.toLocaleString("en-US")} · Fit: ${c.fitScore ?? "—"} · Deadline: ${d.local} (${d.countdown})`,
      );
      for (const s of c.steps) out.push(`  - [${s.done ? "x" : " "}] ${s.title}`);
      out.push(``);
    }
  }
  return out.join("\n").trimEnd() + "\n";
}
