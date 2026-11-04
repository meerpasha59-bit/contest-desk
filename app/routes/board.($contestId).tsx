import { sendToAgentChat } from "@agent-native/core/client/agent-chat";
import {
  actionErrorMessage,
  callAction,
  useActionMutation,
  useActionQuery,
} from "@agent-native/core/client/hooks";
import {
  IconCalendarClock,
  IconChecklist,
  IconDownload,
  IconExternalLink,
  IconPlus,
  IconRefresh,
  IconSparkles,
  IconTrophy,
  IconX,
} from "@tabler/icons-react";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import {
  CONTEST_STATUSES,
  STATUS_LABELS,
  STATUS_TRANSITIONS,
  type ContestStatus,
} from "../../shared/contest-logic";

const ZONE =
  typeof Intl !== "undefined"
    ? Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata"
    : "Asia/Kolkata";

export function meta() {
  return [
    { title: "Contest Desk — human + agent contest board" },
    {
      name: "description",
      content:
        "Track hackathons and bounties with an AI agent on the same board: deadlines in your time zone, fit scores, checklists and what to do next.",
    },
  ];
}

const URGENCY_CLASS: Record<string, string> = {
  closed: "bg-muted text-muted-foreground line-through",
  critical: "bg-red-500/15 text-red-600 dark:text-red-400",
  soon: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  comfortable: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
};

const STATUS_DOT: Record<ContestStatus, string> = {
  scouting: "bg-sky-500",
  eligible: "bg-violet-500",
  building: "bg-amber-500",
  submitted: "bg-emerald-500",
  skipped: "bg-zinc-400",
};

function money(n: number) {
  return n > 0 ? `$${n.toLocaleString("en-US")}` : "No cash";
}

function askAgent(message: string, context?: string) {
  sendToAgentChat({ message, ...(context ? { context } : {}), submit: true, openSidebar: true });
}

export default function BoardRoute() {
  const { contestId } = useParams();
  const navigate = useNavigate();
  const { data, isLoading } = useActionQuery("list-contests", { displayZone: ZONE });
  const { data: next } = useActionQuery("next-up", { limit: 3, displayZone: ZONE });
  const seed = useActionMutation("seed-demo-contests");
  const [adding, setAdding] = useState(false);

  const contests = data?.contests ?? [];
  const selected = useMemo(() => contests.find((c) => c.id === contestId), [contests, contestId]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <header className="flex flex-wrap items-center gap-3 border-b px-5 py-3">
        <div className="flex items-center gap-2">
          <IconTrophy className="size-5 text-amber-500" />
          <h1 className="text-lg font-semibold tracking-tight">Contest Desk</h1>
          <span className="hidden text-xs text-muted-foreground sm:inline">times in {ZONE}</span>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              askAgent(
                "Look at my contest board and tell me what to work on next and why. Use next-up, then open the top contest's checklist.",
              )
            }
          >
            <IconSparkles className="mr-1 size-4" /> Ask agent: what next?
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              try {
                const r = await callAction("export-tracker", { displayZone: ZONE }, { method: "GET" });
                await navigator.clipboard.writeText(r.markdown);
                toast.success(`Copied ${r.count} contests as Markdown`);
              } catch (e) {
                toast.error(actionErrorMessage(e) ?? "Export failed");
              }
            }}
          >
            <IconDownload className="mr-1 size-4" /> Export
          </Button>
          <Button size="sm" onClick={() => setAdding((v) => !v)}>
            <IconPlus className="mr-1 size-4" /> Add contest
          </Button>
        </div>
      </header>

      {adding && <AddContestForm onDone={() => setAdding(false)} />}

      {next?.items?.length ? (
        <section aria-label="Next up" className="flex gap-3 overflow-x-auto border-b bg-muted/30 px-5 py-3">
          <span className="self-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Next up
          </span>
          {next.items.map((item, i) => (
            <Link
              key={item.id}
              to={`/board/${item.id}`}
              className="min-w-64 rounded-lg border bg-background px-3 py-2 text-sm shadow-sm transition hover:border-primary"
            >
              <div className="flex items-center gap-2 font-medium">
                <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[11px] text-primary-foreground">
                  {i + 1}
                </span>
                <span className="truncate">{item.title}</span>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{item.why}</div>
              {item.nextStep && <div className="mt-1 truncate text-xs">→ {item.nextStep.title}</div>}
            </Link>
          ))}
        </section>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <main className="min-h-0 flex-1 overflow-auto p-4">
          {isLoading ? (
            <p className="p-6 text-sm text-muted-foreground">Loading board…</p>
          ) : contests.length === 0 ? (
            <div className="mx-auto mt-16 max-w-md text-center">
              <IconTrophy className="mx-auto size-10 text-amber-500" />
              <h2 className="mt-3 text-lg font-semibold">No contests yet</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Add one yourself, paste a link to the agent, or load four examples.
              </p>
              <div className="mt-4 flex justify-center gap-2">
                <Button onClick={() => setAdding(true)}>Add contest</Button>
                <Button variant="outline" disabled={seed.isPending} onClick={() => seed.mutate({ force: false })}>
                  Load examples
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid min-w-[900px] grid-cols-5 gap-3">
              {CONTEST_STATUSES.map((status) => {
                const col = contests.filter((c) => c.status === status);
                return (
                  <section key={status} aria-label={STATUS_LABELS[status]} className="rounded-xl bg-muted/40 p-2">
                    <h2 className="mb-2 flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <span className={cn("size-2 rounded-full", STATUS_DOT[status])} />
                      {STATUS_LABELS[status]} <span className="ml-auto">{col.length}</span>
                    </h2>
                    <div className="flex flex-col gap-2">
                      {col.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => navigate(`/board/${c.id}`)}
                          className={cn(
                            "rounded-lg border bg-background p-3 text-left text-sm shadow-sm transition hover:border-primary",
                            c.id === contestId && "border-primary ring-2 ring-primary/30",
                          )}
                        >
                          <div className="font-medium leading-snug">{c.title}</div>
                          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                            <span className={cn("rounded px-1.5 py-0.5 font-medium", URGENCY_CLASS[c.deadline.urgency])}>
                              {c.deadline.countdown}
                            </span>
                            <span className="rounded bg-muted px-1.5 py-0.5">{money(c.prizeUsd)}</span>
                            {c.fitScore !== null && (
                              <span className="rounded bg-muted px-1.5 py-0.5">fit {c.fitScore}</span>
                            )}
                          </div>
                          {c.stepsTotal > 0 && (
                            <div className="mt-2 h-1.5 overflow-hidden rounded bg-muted">
                              <div
                                className="h-full bg-primary"
                                style={{ width: `${Math.round((c.stepsDone / c.stepsTotal) * 100)}%` }}
                              />
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </main>
        {selected && <ContestPanel contest={selected} onClose={() => navigate("/board")} />}
      </div>
    </div>
  );
}

interface Contest {
  id: string;
  title: string;
  url: string;
  prizeUsd: number;
  status: ContestStatus;
  deadlineZone: string;
  deadline: { local: string; countdown: string; urgency: string };
  free: boolean;
  soloOk: boolean;
  aiAllowed: boolean;
  effortHours: number;
  fitScore: number | null;
  requirements: string;
  notes: string;
  steps: Array<{ id: string; title: string; done: boolean }>;
  stepsDone: number;
  stepsTotal: number;
}

function ContestPanel({ contest, onClose }: { contest: Contest; onClose: () => void }) {
  const update = useActionMutation("update-contest");
  const toggle = useActionMutation("toggle-step");
  const plan = useActionMutation("generate-plan");
  const addStep = useActionMutation("add-step");
  const [stepText, setStepText] = useState("");
  const context = `Selected contest id=${contest.id} "${contest.title}" (${contest.url}). Status ${contest.status}, deadline ${contest.deadline.local} ${ZONE} (${contest.deadline.countdown} left), prize ${money(contest.prizeUsd)}, fit ${contest.fitScore ?? "n/a"}, ${contest.stepsDone}/${contest.stepsTotal} steps done.`;

  return (
    <aside
      aria-label="Contest details"
      className="flex w-[380px] shrink-0 flex-col overflow-auto border-l bg-background p-4 text-sm"
    >
      <div className="flex items-start gap-2">
        <h2 className="flex-1 text-base font-semibold leading-snug">{contest.title}</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 hover:bg-muted">
          <IconX className="size-4" />
        </button>
      </div>
      {contest.url && (
        <a href={contest.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-primary">
          {contest.url.replace(/^https?:\/\//, "").slice(0, 48)} <IconExternalLink className="size-3" />
        </a>
      )}

      <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <div className="col-span-2 rounded-lg bg-muted/50 p-2">
          <dt className="flex items-center gap-1 text-muted-foreground">
            <IconCalendarClock className="size-3.5" /> Deadline (your time)
          </dt>
          <dd className="mt-0.5 font-medium">
            {contest.deadline.local} ·{" "}
            <span className={cn("rounded px-1", URGENCY_CLASS[contest.deadline.urgency])}>{contest.deadline.countdown}</span>
          </dd>
          <dd className="text-muted-foreground">organiser zone: {contest.deadlineZone}</dd>
        </div>
        <div className="rounded-lg bg-muted/50 p-2">
          <dt className="text-muted-foreground">Prize</dt>
          <dd className="font-medium">{money(contest.prizeUsd)}</dd>
        </div>
        <div className="rounded-lg bg-muted/50 p-2">
          <dt className="text-muted-foreground">Fit score</dt>
          <dd className="font-medium">{contest.fitScore ?? "—"}/100</dd>
        </div>
        <div className="col-span-2 flex flex-wrap gap-1">
          {[contest.free ? "Free" : "Paid entry", contest.soloOk ? "Solo OK" : "Team only", contest.aiAllowed ? "AI allowed" : "No AI", `~${contest.effortHours}h work`].map((t) => (
            <span key={t} className="rounded-full border px-2 py-0.5">{t}</span>
          ))}
        </div>
      </dl>

      <div className="mt-4">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Move to</div>
        <div className="flex flex-wrap gap-1">
          {STATUS_TRANSITIONS[contest.status].map((s) => (
            <Button
              key={s}
              size="sm"
              variant="outline"
              disabled={update.isPending}
              onClick={() =>
                update.mutate(
                  { id: contest.id, status: s, displayZone: ZONE },
                  { onError: (e) => toast.error(actionErrorMessage(e) ?? "Could not move") },
                )
              }
            >
              <span className={cn("mr-1.5 size-2 rounded-full", STATUS_DOT[s])} />
              {STATUS_LABELS[s]}
            </Button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <IconChecklist className="size-3.5" /> Checklist {contest.stepsDone}/{contest.stepsTotal}
          <button
            type="button"
            className="ml-auto inline-flex items-center gap-1 normal-case text-primary"
            disabled={plan.isPending}
            onClick={() => plan.mutate({ id: contest.id, replace: false, displayZone: ZONE })}
          >
            <IconRefresh className="size-3" /> from requirements
          </button>
        </div>
        <ul className="flex flex-col gap-1">
          {contest.steps.map((s) => (
            <li key={s.id}>
              <label className="flex cursor-pointer items-start gap-2 rounded px-1 py-1 hover:bg-muted/50">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={s.done}
                  onChange={(e) => toggle.mutate({ stepId: s.id, done: e.target.checked })}
                />
                <span className={cn(s.done && "text-muted-foreground line-through")}>{s.title}</span>
              </label>
            </li>
          ))}
        </ul>
        <form
          className="mt-2 flex gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (!stepText.trim()) return;
            addStep.mutate({ id: contest.id, title: stepText.trim(), displayZone: ZONE });
            setStepText("");
          }}
        >
          <Input value={stepText} onChange={(e) => setStepText(e.target.value)} placeholder="Add a step…" className="h-8" />
          <Button size="sm" type="submit" variant="outline">Add</Button>
        </form>
      </div>

      {contest.requirements && (
        <details className="mt-4">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted-foreground">Requirements</summary>
          <pre className="mt-1 whitespace-pre-wrap font-sans text-xs">{contest.requirements}</pre>
        </details>
      )}

      <div className="mt-4 border-t pt-3">
        <div className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <IconSparkles className="size-3.5" /> Hand off to the agent
        </div>
        <div className="flex flex-col gap-1">
          {[
            ["Plan this one", "Break this contest into a concrete checklist for the time I have left. Add any missing steps with add-step."],
            ["Is it still open?", "Check whether this contest is still open and the deadline is right. Read the official page, convert the deadline with convert-deadline, and fix it with update-contest if it changed."],
            ["Should I enter?", "Explain the fit score for this contest with score-fit and give me a clear go / maybe / pass."],
            ["Draft my description", "Draft the project description for this contest's submission form, including the team and any pre-existing work, and save it to the contest notes with update-contest."],
          ].map(([label = "", prompt = ""]) => (
            <Button key={label} size="sm" variant="ghost" className="justify-start" onClick={() => askAgent(prompt, context)}>
              {label}
            </Button>
          ))}
        </div>
      </div>
      {contest.notes && (
        <div className="mt-3 rounded-lg bg-muted/50 p-2 text-xs">
          <div className="font-semibold">Notes</div>
          <p className="mt-1 whitespace-pre-wrap">{contest.notes}</p>
        </div>
      )}
    </aside>
  );
}

function AddContestForm({ onDone }: { onDone: () => void }) {
  const add = useActionMutation("add-contest");
  const [f, setF] = useState({
    title: "",
    url: "",
    prizeUsd: "",
    deadline: "",
    deadlineZone: "UTC",
    effortHours: "8",
    requirements: "",
    free: true,
    soloOk: true,
    aiAllowed: true,
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  return (
    <form
      className="grid gap-2 border-b bg-muted/20 px-5 py-3 text-sm md:grid-cols-6"
      onSubmit={(e) => {
        e.preventDefault();
        add.mutate(
          {
            title: f.title,
            url: f.url,
            prizeUsd: Number(f.prizeUsd || 0),
            deadline: f.deadline,
            deadlineZone: f.deadlineZone,
            effortHours: Number(f.effortHours || 8),
            requirements: f.requirements,
            free: f.free,
            soloOk: f.soloOk,
            aiAllowed: f.aiAllowed,
            displayZone: ZONE,
          },
          {
            onSuccess: () => {
              toast.success("Contest added with a checklist");
              onDone();
            },
            onError: (err) => toast.error(actionErrorMessage(err) ?? "Could not add"),
          },
        );
      }}
    >
      <Input required placeholder="Contest name" value={f.title} onChange={set("title")} className="md:col-span-2" />
      <Input placeholder="https://…" value={f.url} onChange={set("url")} className="md:col-span-2" />
      <Input placeholder="Prize USD" inputMode="numeric" value={f.prizeUsd} onChange={set("prizeUsd")} />
      <Input placeholder="Hours of work" inputMode="numeric" value={f.effortHours} onChange={set("effortHours")} />
      <Input required type="datetime-local" value={f.deadline} onChange={set("deadline")} className="md:col-span-2" aria-label="Deadline" />
      <Input placeholder="Organiser time zone, e.g. America/Los_Angeles" value={f.deadlineZone} onChange={set("deadlineZone")} className="md:col-span-2" />
      <div className="flex items-center gap-3 md:col-span-2">
        {(["free", "soloOk", "aiAllowed"] as const).map((k) => (
          <label key={k} className="flex items-center gap-1">
            <input type="checkbox" checked={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.checked })} />
            {k === "free" ? "Free" : k === "soloOk" ? "Solo OK" : "AI OK"}
          </label>
        ))}
      </div>
      <textarea
        placeholder="Requirements, one per line (repo, video, deploy…)"
        value={f.requirements}
        onChange={set("requirements")}
        className="min-h-16 rounded-md border bg-background px-3 py-2 md:col-span-5"
      />
      <Button type="submit" disabled={add.isPending} className="self-end">
        {add.isPending ? "Adding…" : "Add"}
      </Button>
    </form>
  );
}
