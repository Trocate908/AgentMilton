import { createInsertSchema } from "drizzle-zod";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const agentSettingsTable = pgTable("agent_settings", {
  id: integer("id").primaryKey().default(1),
  primaryProvider: text("primary_provider").notNull().default("openrouter"),
  primaryModel: text("primary_model"),
  fallbackProvider: text("fallback_provider").notNull().default("openrouter"),
  fallbackModel: text("fallback_model"),
  allowPaidModels: boolean("allow_paid_models").notNull().default(false),
  allowPaidFallback: boolean("allow_paid_fallback").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const agentTasksTable = pgTable(
  "agent_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    repositoryFullName: text("repository_full_name").notNull(),
    baseBranch: text("base_branch").notNull(),
    baseCommitSha: text("base_commit_sha"),
    featureBranch: text("feature_branch"),
    prompt: text("prompt").notNull(),
    title: text("title").notNull().default("Repository task"),
    status: text("status").notNull().default("queued"),
    progress: integer("progress").notNull().default(0),
    provider: text("provider").notNull().default("openrouter"),
    model: text("model").notNull().default(""),
    summary: text("summary"),
    plan: jsonb("plan").$type<string[]>().notNull().default([]),
    testStatus: text("test_status").notNull().default("not_run"),
    testSuite: text("test_suite"),
    testOutput: text("test_output"),
    testExitCode: integer("test_exit_code"),
    estimatedCostUsd: numeric("estimated_cost_usd", {
      precision: 18,
      scale: 10,
    }),
    promptTokens: integer("prompt_tokens").notNull().default(0),
    completionTokens: integer("completion_tokens").notNull().default(0),
    approvalAt: timestamp("approval_at", { withTimezone: true }),
    commitSha: text("commit_sha"),
    pullRequestUrl: text("pull_request_url"),
    failureCode: text("failure_code"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("agent_tasks_updated_at_idx").on(table.updatedAt),
    index("agent_tasks_repository_idx").on(table.repositoryFullName),
  ],
);

export const agentTaskFilesTable = pgTable(
  "agent_task_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => agentTasksTable.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    operation: text("operation").notNull().default("upsert"),
    baseSha: text("base_sha"),
    beforeContent: text("before_content"),
    afterContent: text("after_content"),
    patch: text("patch").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("agent_task_files_task_path_idx").on(table.taskId, table.path),
  ],
);

export const agentTaskEventsTable = pgTable(
  "agent_task_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => agentTasksTable.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    message: text("message").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("agent_task_events_task_created_idx").on(table.taskId, table.createdAt)],
);

export const agentTaskMessagesTable = pgTable(
  "agent_task_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => agentTasksTable.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("agent_task_messages_task_created_idx").on(table.taskId, table.createdAt)],
);

export const insertAgentSettingsSchema = createInsertSchema(agentSettingsTable);
export const insertAgentTaskSchema = createInsertSchema(agentTasksTable);
export const insertAgentTaskFileSchema = createInsertSchema(agentTaskFilesTable);
export const insertAgentTaskEventSchema = createInsertSchema(agentTaskEventsTable);
export const insertAgentTaskMessageSchema = createInsertSchema(agentTaskMessagesTable);

export type AgentSettings = typeof agentSettingsTable.$inferSelect;
export type AgentTask = typeof agentTasksTable.$inferSelect;
export type AgentTaskFile = typeof agentTaskFilesTable.$inferSelect;
export type AgentTaskEvent = typeof agentTaskEventsTable.$inferSelect;
export type AgentTaskMessage = typeof agentTaskMessagesTable.$inferSelect;
export type InsertAgentSettings = z.infer<typeof insertAgentSettingsSchema>;
export type InsertAgentTask = z.infer<typeof insertAgentTaskSchema>;
