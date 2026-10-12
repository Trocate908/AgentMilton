import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const ownerAccountsTable = pgTable("owner_accounts", {
  id: integer("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  mustChangePassword: boolean("must_change_password").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const ownerSessionsTable = pgTable("owner_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  ownerId: integer("owner_id")
    .notNull()
    .references(() => ownerAccountsTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const ownerLoginAttemptsTable = pgTable("owner_login_attempts", {
  addressHash: text("address_hash").primaryKey(),
  windowStartedAt: timestamp("window_started_at", {
    withTimezone: true,
  }).notNull(),
  attemptCount: integer("attempt_count").notNull().default(0),
  blockedUntil: timestamp("blocked_until", { withTimezone: true }),
});

export type OwnerAccount = typeof ownerAccountsTable.$inferSelect;
export type OwnerSession = typeof ownerSessionsTable.$inferSelect;
export type OwnerLoginAttempt = typeof ownerLoginAttemptsTable.$inferSelect;

export const ownerAccountSchema = z.object({
  id: z.number().int(),
  username: z.string(),
  passwordHash: z.string(),
  mustChangePassword: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
