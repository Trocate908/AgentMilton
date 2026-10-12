import { asc, desc, eq } from "drizzle-orm";
import {
  agentTaskEventsTable,
  agentTaskFilesTable,
  agentTaskMessagesTable,
  agentTasksTable,
  db,
  type AgentTask,
  type AgentTaskFile,
} from "@workspace/db";

export type AgentTaskUpdate = Partial<
  Pick<
    AgentTask,
    | "title"
    | "status"
    | "progress"
    | "baseCommitSha"
    | "featureBranch"
    | "summary"
    | "plan"
    | "testStatus"
    | "testSuite"
    | "testOutput"
    | "testExitCode"
    | "estimatedCostUsd"
    | "promptTokens"
    | "completionTokens"
    | "approvalAt"
    | "commitSha"
    | "pullRequestUrl"
    | "failureCode"
  >
>;

export async function getAgentTask(id: string): Promise<AgentTask | null> {
  const [task] = await db
    .select()
    .from(agentTasksTable)
    .where(eq(agentTasksTable.id, id))
    .limit(1);
  return task ?? null;
}

export async function updateAgentTask(
  id: string,
  values: AgentTaskUpdate,
): Promise<void> {
  await db
    .update(agentTasksTable)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(agentTasksTable.id, id));
}

export async function addAgentTaskEvent(
  taskId: string,
  eventType: string,
  message: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await db.insert(agentTaskEventsTable).values({
    taskId,
    eventType,
    message: message.slice(0, 1000),
    metadata,
  });
}

export async function addAgentTaskMessage(
  taskId: string,
  role: "owner" | "assistant",
  content: string,
): Promise<void> {
  await db.insert(agentTaskMessagesTable).values({
    taskId,
    role,
    content: content.slice(0, 12_000),
  });
}

export async function listAgentTaskMessages(taskId: string) {
  return db
    .select()
    .from(agentTaskMessagesTable)
    .where(eq(agentTaskMessagesTable.taskId, taskId))
    .orderBy(asc(agentTaskMessagesTable.createdAt));
}

export async function replaceAgentTaskFiles(
  taskId: string,
  files: Array<Omit<AgentTaskFile, "id" | "taskId" | "createdAt">>,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .delete(agentTaskFilesTable)
      .where(eq(agentTaskFilesTable.taskId, taskId));
    if (files.length > 0) {
      await tx.insert(agentTaskFilesTable).values(
        files.map((file) => ({
          taskId,
          path: file.path,
          operation: file.operation,
          baseSha: file.baseSha,
          beforeContent: file.beforeContent,
          afterContent: file.afterContent,
          patch: file.patch,
        })),
      );
    }
  });
}

function serializeTask(task: AgentTask) {
  const estimatedCost = task.estimatedCostUsd === null
    ? null
    : Number(task.estimatedCostUsd);
  return {
    id: task.id,
    repositoryFullName: task.repositoryFullName,
    baseBranch: task.baseBranch,
    featureBranch: task.featureBranch,
    prompt: task.prompt,
    title: task.title,
    status: task.status,
    progress: task.progress,
    provider: task.provider,
    model: task.model,
    summary: task.summary,
    testStatus: task.testStatus,
    estimatedCostUsd: Number.isFinite(estimatedCost) ? estimatedCost : null,
    promptTokens: task.promptTokens,
    completionTokens: task.completionTokens,
    commitSha: task.commitSha,
    pullRequestUrl: task.pullRequestUrl,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

export async function getAgentTaskSummary(id: string) {
  const task = await getAgentTask(id);
  return task ? serializeTask(task) : null;
}

export async function listAgentTaskSummaries() {
  const tasks = await db
    .select()
    .from(agentTasksTable)
    .orderBy(desc(agentTasksTable.updatedAt))
    .limit(50);
  return tasks.map(serializeTask);
}

export async function getAgentTaskDetail(id: string) {
  const task = await getAgentTask(id);
  if (!task) return null;
  const [files, events, messages] = await Promise.all([
    db
      .select()
      .from(agentTaskFilesTable)
      .where(eq(agentTaskFilesTable.taskId, id))
      .orderBy(asc(agentTaskFilesTable.path)),
    db
      .select()
      .from(agentTaskEventsTable)
      .where(eq(agentTaskEventsTable.taskId, id))
      .orderBy(asc(agentTaskEventsTable.createdAt)),
    db
      .select()
      .from(agentTaskMessagesTable)
      .where(eq(agentTaskMessagesTable.taskId, id))
      .orderBy(asc(agentTaskMessagesTable.createdAt)),
  ]);
  return {
    ...serializeTask(task),
    plan: task.plan ?? [],
    testSuite: task.testSuite,
    testOutput: task.testOutput,
    testExitCode: task.testExitCode,
    events: events.map((event) => ({
      eventType: event.eventType,
      message: event.message,
      createdAt: event.createdAt.toISOString(),
    })),
    files: files.map((file) => ({
      path: file.path,
      operation: file.operation,
      beforeContent: file.beforeContent,
      afterContent: file.afterContent,
      patch: file.patch,
    })),
    messages: messages.map((message) => ({
      role: message.role,
      content: message.content,
      createdAt: message.createdAt.toISOString(),
    })),
  };
}
