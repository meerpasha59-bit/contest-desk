import { z } from "zod";

import { CONTEST_STATUSES } from "../../shared/contest-logic.js";

export const statusEnum = z.enum(CONTEST_STATUSES);

export const zoneArg = z
  .string()
  .default("Asia/Kolkata")
  .describe('IANA time zone to show deadlines in; defaults to "Asia/Kolkata"');

export const boolArg = z.preprocess(
  (v) => (v === "true" ? true : v === "false" ? false : v),
  z.boolean(),
);

export const deadlineOut = z.object({
  utc: z.string(),
  local: z.string(),
  timeZone: z.string(),
  hoursLeft: z.number(),
  isPast: z.boolean(),
  countdown: z.string(),
  urgency: z.enum(["closed", "critical", "soon", "comfortable"]),
});

export const stepOut = z.object({
  id: z.string(),
  title: z.string(),
  done: z.boolean(),
  position: z.number(),
});

export const contestOut = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string(),
  prizeUsd: z.number(),
  status: statusEnum,
  deadlineUtc: z.string(),
  deadlineZone: z.string(),
  deadline: deadlineOut,
  free: z.boolean(),
  soloOk: z.boolean(),
  aiAllowed: z.boolean(),
  effortHours: z.number(),
  fitScore: z.number().nullable(),
  requirements: z.string(),
  notes: z.string(),
  steps: z.array(stepOut),
  stepsDone: z.number(),
  stepsTotal: z.number(),
});
