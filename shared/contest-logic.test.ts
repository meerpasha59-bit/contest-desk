import { describe, expect, it } from "vitest";
import {
  canTransition,
  deadlineInfo,
  exportMarkdown,
  formatCountdown,
  generatePlan,
  parseStatus,
  rankNextUp,
  scoreFit,
  wallClockToUtc,
} from "./contest-logic";

const NOW = new Date("2026-11-04T12:00:00Z");

describe("deadlines", () => {
  it("converts a Pacific wall-clock deadline to UTC (PST, after DST end)", () => {
    expect(wallClockToUtc("2026-11-09T23:59", "America/Los_Angeles").toISOString()).toBe(
      "2026-11-10T07:59:00.000Z",
    );
  });

  it("handles PDT before the DST switch", () => {
    expect(wallClockToUtc("2026-10-20T12:00", "America/Los_Angeles").toISOString()).toBe(
      "2026-10-20T19:00:00.000Z",
    );
  });

  it("defaults a date-only deadline to 23:59 local", () => {
    expect(wallClockToUtc("2026-12-01", "Asia/Kolkata").toISOString()).toBe("2026-12-01T18:29:00.000Z");
  });

  it("respects an explicit offset", () => {
    expect(wallClockToUtc("2026-11-09T23:59:00Z", "Asia/Kolkata").toISOString()).toBe(
      "2026-11-09T23:59:00.000Z",
    );
  });

  it("rejects junk", () => {
    expect(() => wallClockToUtc("next tuesday", "UTC")).toThrow();
  });

  it("shows the deadline in the viewer's zone with a countdown", () => {
    const info = deadlineInfo("2026-11-10T07:59:00Z", "Asia/Kolkata", NOW);
    expect(info.local).toContain("10 Nov 2026");
    expect(info.local).toContain("13:29");
    expect(info.countdown).toBe("5d 19h");
    expect(info.urgency).toBe("comfortable");
    expect(info.isPast).toBe(false);
  });

  it("flags critical and closed deadlines", () => {
    expect(deadlineInfo("2026-11-04T20:00:00Z", "UTC", NOW).urgency).toBe("critical");
    expect(deadlineInfo("2026-11-01T00:00:00Z", "UTC", NOW).urgency).toBe("closed");
    expect(formatCountdown(-1)).toBe("closed");
    expect(formatCountdown(90 * 60000)).toBe("1h 30m");
  });
});

describe("scoreFit", () => {
  const base = {
    prizeUsd: 10000,
    deadlineUtc: "2026-11-10T07:59:00Z",
    free: true,
    soloOk: true,
    aiAllowed: true,
    effortHours: 12,
  };

  it("scores a big, free, solo, AI-friendly contest as go", () => {
    const r = scoreFit(base, NOW);
    expect(r.score).toBe(100);
    expect(r.verdict).toBe("go");
  });

  it("paid entry is a hard pass", () => {
    const r = scoreFit({ ...base, free: false }, NOW);
    expect(r.verdict).toBe("pass");
    expect(r.score).toBeLessThanOrEqual(30);
  });

  it("team-only is a hard pass", () => {
    expect(scoreFit({ ...base, soloOk: false }, NOW).verdict).toBe("pass");
  });

  it("not enough time for the work is a pass", () => {
    const r = scoreFit({ ...base, deadlineUtc: "2026-11-04T16:00:00Z", effortHours: 20 }, NOW);
    expect(r.parts.time).toBe(0);
    expect(r.verdict).toBe("pass");
    expect(r.reasons.join(" ")).toMatch(/Only 4h left/);
  });

  it("small prize, tight runway and no AI lands at maybe", () => {
    const r = scoreFit({ ...base, prizeUsd: 100, effortHours: 80, aiAllowed: false }, NOW);
    expect(r.score).toBe(60);
    expect(r.verdict).toBe("maybe");
  });
});

describe("generatePlan", () => {
  it("turns requirements into an ordered checklist", () => {
    const plan = generatePlan(
      "- Public GitHub repo\n- Record a demo video under 3 minutes\n- Must use the Agent-Native framework\n- Description must list pre-existing work",
    );
    const titles = plan.map((p) => p.title);
    expect(titles[0]).toBe("Read the official rules and eligibility");
    expect(titles[titles.length - 1]).toBe("Submit the entry and confirm receipt");
    expect(titles).toContain("Push a public repository with README and license");
    expect(titles).toContain("Record the demo video and check it plays without login");
    expect(titles).toContain("Must use the Agent-Native framework");
    expect(new Set(titles).size).toBe(titles.length);
    for (let i = 1; i < plan.length; i++) {
      expect(plan[i - 1]!.dueOffsetHours).toBeGreaterThanOrEqual(plan[i]!.dueOffsetHours);
    }
  });

  it("still gives a minimal plan for empty requirements", () => {
    expect(generatePlan("").map((p) => p.title)).toEqual([
      "Read the official rules and eligibility",
      "Build the core working flow",
      "Submit the entry and confirm receipt",
    ]);
  });
});

describe("status machine", () => {
  it("allows and blocks transitions", () => {
    expect(canTransition("scouting", "eligible")).toBe(true);
    expect(canTransition("submitted", "scouting")).toBe(false);
    expect(canTransition("building", "building")).toBe(true);
    expect(() => parseStatus("done")).toThrow();
  });
});

describe("rankNextUp", () => {
  const mk = (over: Partial<Parameters<typeof rankNextUp>[0][number]>) => ({
    id: "x",
    title: "x",
    status: "eligible" as const,
    deadlineUtc: "2026-11-10T00:00:00Z",
    prizeUsd: 1000,
    fitScore: 70,
    stepsDone: 0,
    stepsTotal: 5,
    ...over,
  });

  it("puts the closest deadline first and drops closed/submitted/skipped", () => {
    const ranked = rankNextUp(
      [
        mk({ id: "far", deadlineUtc: "2026-11-30T00:00:00Z" }),
        mk({ id: "near", deadlineUtc: "2026-11-05T00:00:00Z" }),
        mk({ id: "done", status: "submitted" }),
        mk({ id: "skip", status: "skipped" }),
        mk({ id: "closed", deadlineUtc: "2026-11-01T00:00:00Z" }),
      ],
      NOW,
    );
    expect(ranked.map((r) => r.id)).toEqual(["near", "far"]);
    expect(ranked[0]!.why).toMatch(/left/);
  });

  it("favours bigger prizes at equal urgency", () => {
    const ranked = rankNextUp([mk({ id: "small", prizeUsd: 100 }), mk({ id: "big", prizeUsd: 10000 })], NOW);
    expect(ranked[0]!.id).toBe("big");
  });
});

describe("exportMarkdown", () => {
  it("groups by status with checkboxes", () => {
    const md = exportMarkdown(
      [
        {
          title: "Agent-Native Hackathon",
          url: "https://www.builder.io/hackathon",
          status: "building",
          prizeUsd: 10000,
          deadlineUtc: "2026-11-10T07:59:00Z",
          fitScore: 92,
          steps: [
            { title: "Build", done: true },
            { title: "Submit", done: false },
          ],
        },
      ],
      "Asia/Kolkata",
      NOW,
    );
    expect(md).toContain("## Building (1)");
    expect(md).toContain("- [x] Build");
    expect(md).toContain("- [ ] Submit");
    expect(md).toContain("13:29");
  });
});
