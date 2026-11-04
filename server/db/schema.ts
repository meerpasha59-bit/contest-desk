import { sql } from "drizzle-orm";
import { boolean, integer, pgTable, text } from "drizzle-orm/pg-core";

/** A contest, bounty or hackathon the user is tracking. */
export const contests = pgTable("contests", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  url: text("url").notNull().default(""),
  prizeUsd: integer("prize_usd").notNull().default(0),
  /** UTC instant, ISO 8601 (Date#toISOString) so string order = time order. */
  deadlineUtc: text("deadline_utc").notNull(),
  /** Zone the organiser stated the deadline in, e.g. America/Los_Angeles. */
  deadlineZone: text("deadline_zone").notNull().default("UTC"),
  status: text("status").notNull().default("scouting"),
  free: boolean("free").notNull().default(true),
  soloOk: boolean("solo_ok").notNull().default(true),
  aiAllowed: boolean("ai_allowed").notNull().default(true),
  effortHours: integer("effort_hours").notNull().default(8),
  fitScore: integer("fit_score"),
  requirements: text("requirements").notNull().default(""),
  notes: text("notes").notNull().default(""),
  ownerEmail: text("owner_email").notNull(),
  createdAt: text("created_at").notNull().default(sql`now()`),
});

/** Checklist steps for a contest. */
export const contestSteps = pgTable("contest_steps", {
  id: text("id").primaryKey(),
  contestId: text("contest_id").notNull(),
  position: integer("position").notNull().default(0),
  title: text("title").notNull(),
  done: boolean("done").notNull().default(false),
  ownerEmail: text("owner_email").notNull(),
});
