import { and, desc, eq, inArray } from "drizzle-orm";
import { Router, type IRouter, type Response } from "express";
import {
  AgentTaskStatus,
  ApproveAndPushAgentTaskBody,
  ApproveAndPushAgentTaskParams,
  ApproveAndPushAgentTaskResponse,
  CreateAgentTaskBody,
  CreateAgentTaskPullRequestBody,
  CreateAgentTaskPullRequestParams,
  CreateAgentTaskPullRequestResponse,
  CreateAgentTaskResponse,
  GetAgentTaskParams,
  GetAgentTaskResponse,
  ListAgentTasksResponse,
  RunAgentTaskTestsBody,
  RunAgentTaskTestsParams,
  RunAgentTaskTestsResponse,
  SendAgentTaskMessageBody,
  SendAgentTaskMessageParams,
  SendAgentTaskMessageResponse,
} from "@workspace/api-zod";
import {
  type AiProvider,
  getProviderModel,
  ProviderApiError,
} from "../lib/ai-providers";
import {
  agentTaskFilesTable,
  agentTasksTable,
  db,
} from "@workspace/db";
import {
  addAgentTaskEvent,
  addAgentTaskMessage,
  getAgentTask,
  getAgentTaskDetail,
  listAgentTaskSummaries,
  updateAgentTask,
} from "../lib/agent-task-store";
import { getOrCreateAgentSettings } from "../lib/agent-settings";
import {
  createGitHubClient,
  GitHubApiError,
} from "../lib/github-client";
import {
  markAgentTaskTestsBlocked,
  startAgentTaskGeneration,
} from "../lib/agent-task-runner";
import { redactLikelySecrets } from "../lib/secret-scanner";
import { requireChangedPassword, requireOwner } from "../lib/owner-auth";

const router: IRouter = Router();
const ACTIVE_TASK_STATUSES = [
  "queued",
  "inspecting",
  "planning",
  "generating",
  "pushing",
];

function sendError(res: Response, error: unknown): void {
  if (error instanceof ProviderApiError) {
    res.status(error.status === 402 ? 400 : error.status).json({ error: error.message });
    return;
  }
  if (error instanceof GitHubApiError) {
    const status = [400, 403, 404, 409, 429].includes(error.status)
      ? error.status
      : 502;
    res.status(status).json({ error: error.message });
    return;
  }
  res.status(500).json({ error: "The coding task could not be completed." });
}

function safePrompt(value: string): string {
  return redactLikelySecrets(value).slice(0, 12_000);
}

function splitRepository(fullName: string): [string, string] | null {
  const parts = fullName.split("/");
  if (
    parts.length !== 2 ||
    !/^[A-Za-z0-9_.-]{1,100}$/.test(parts[0]!) ||
    !/^[A-Za-z0-9_.-]{1,100}$/.test(parts[1]!)
  ) {
    return null;
  }
  return [parts[0]!, parts[1]!];
}

async function respondWithTask(res: Response, taskId: string, status = 200): Promise<void> {
  const detail = await getAgentTaskDetail(taskId);
  if (!detail) {
    res.status(404).json({ error: "Task not found." });
    return;
  }
  res.status(status).json(GetAgentTaskResponse.parse(detail));
}

router.get(
  "/agent/tasks",
  requireOwner,
  requireChangedPassword,
  async (_req, res): Promise<void> => {
    try {
      res.json(ListAgentTasksResponse.parse(await listAgentTaskSummaries()));
    } catch {
      res.status(500).json({ error: "Recent tasks are temporarily unavailable." });
    }
  },
);

router.post(
  "/agent/tasks",
  requireOwner,
  requireChangedPassword,
  async (req, res): Promise<void> => {
    try {
      const input = CreateAgentTaskBody.parse(req.body);
      const repository = splitRepository(input.repositoryFullName);
      if (!repository) {
        res.status(400).json({ error: "Choose a valid owner/repository pair." });
        return;
      }
      const settings = await getOrCreateAgentSettings();
      if (!settings.primaryModel) {
        res.status(400).json({ error: "Choose an AI provider model in Settings first." });
        return;
      }
      const model = await getProviderModel(
        settings.primaryProvider as AiProvider,
        settings.primaryModel,
      );
      if (model.priceStatus !== "free" && !settings.allowPaidModels) {
        res.status(400).json({
          error: "This model may incur charges. Enable paid usage in Settings first.",
        });
        return;
      }
      const activeTasks = await db
        .select({ id: agentTasksTable.id })
        .from(agentTasksTable)
        .where(inArray(agentTasksTable.status, ACTIVE_TASK_STATUSES))
        .limit(3);
      if (activeTasks.length >= 3) {
        res.status(429).json({
          error: "Three tasks are already active. Wait for one to finish before starting another.",
        });
        return;
      }

      const prompt = safePrompt(input.prompt);
      const [task] = await db
        .insert(agentTasksTable)
        .values({
          repositoryFullName: input.repositoryFullName,
          baseBranch: input.baseBranch,
          prompt,
          provider: settings.primaryProvider,
          model: settings.primaryModel,
          status: "queued",
          title: "Inspecting repository",
          estimatedCostUsd:
            settings.primaryProvider === "gemini" ? null : "0",
        })
        .returning();
      if (!task) throw new Error("Task could not be created.");
      await addAgentTaskMessage(task.id, "owner", prompt);
      await addAgentTaskEvent(
        task.id,
        "task_queued",
        `Queued a repository task for ${input.repositoryFullName} on ${input.baseBranch}.`,
      );
      startAgentTaskGeneration(task.id);
      await respondWithTask(res, task.id, 202);
    } catch (error) {
      if (error instanceof Error && error.name === "ZodError") {
        res.status(400).json({ error: "Enter a repository, branch, and task request." });
      } else sendError(res, error);
    }
  },
);

router.get(
  "/agent/tasks/:taskId",
  requireOwner,
  requireChangedPassword,
  async (req, res): Promise<void> => {
    try {
      const params = GetAgentTaskParams.parse(req.params);
      await respondWithTask(res, params.taskId);
    } catch (error) {
      if (error instanceof Error && error.name === "ZodError") {
        res.status(400).json({ error: "Invalid task identifier." });
      } else sendError(res, error);
    }
  },
);

router.post(
  "/agent/tasks/:taskId/messages",
  requireOwner,
  requireChangedPassword,
  async (req, res): Promise<void> => {
    try {
      const params = SendAgentTaskMessageParams.parse(req.params);
      const input = SendAgentTaskMessageBody.parse(req.body);
      const task = await getAgentTask(params.taskId);
      if (!task) {
        res.status(404).json({ error: "Task not found." });
        return;
      }
      if (["pushed", "pull_request", "pushing"].includes(task.status)) {
        res.status(400).json({
          error: "This task has already been pushed. Start a new task for further changes.",
        });
        return;
      }
      if (ACTIVE_TASK_STATUSES.includes(task.status)) {
        res.status(409).json({ error: "Wait for the current task step to finish first." });
        return;
      }
      const content = safePrompt(input.content);
      await addAgentTaskMessage(task.id, "owner", content);
      await addAgentTaskEvent(task.id, "revision_requested", "Queued a requested revision.");
      await updateAgentTask(task.id, {
        status: "queued",
        progress: 0,
        testStatus: "not_run",
        testSuite: null,
        testOutput: null,
        testExitCode: null,
      });
      startAgentTaskGeneration(task.id);
      await respondWithTask(res, task.id, 202);
    } catch (error) {
      if (error instanceof Error && error.name === "ZodError") {
        res.status(400).json({ error: "Enter a task message." });
      } else sendError(res, error);
    }
  },
);

router.post(
  "/agent/tasks/:taskId/tests",
  requireOwner,
  requireChangedPassword,
  async (req, res): Promise<void> => {
    try {
      const params = RunAgentTaskTestsParams.parse(req.params);
      const input = RunAgentTaskTestsBody.parse(req.body);
      const task = await getAgentTask(params.taskId);
      if (!task) {
        res.status(404).json({ error: "Task not found." });
        return;
      }
      if (!["draft", "tests_failed", "test_blocked"].includes(task.status)) {
        res.status(400).json({ error: "Tests can only be requested for a reviewable draft." });
        return;
      }
      await markAgentTaskTestsBlocked(task, input.suite);
      await respondWithTask(res, task.id);
    } catch (error) {
      if (error instanceof Error && error.name === "ZodError") {
        res.status(400).json({ error: "Select a supported test suite." });
      } else sendError(res, error);
    }
  },
);

router.post(
  "/agent/tasks/:taskId/approve-push",
  requireOwner,
  requireChangedPassword,
  async (req, res): Promise<void> => {
    let taskId: string | undefined;
    try {
      const params = ApproveAndPushAgentTaskParams.parse(req.params);
      taskId = params.taskId;
      const input = ApproveAndPushAgentTaskBody.parse(req.body);
      const task = await getAgentTask(taskId);
      if (!task) {
        res.status(404).json({ error: "Task not found." });
        return;
      }
      if (input.confirmation !== "PUSH") {
        res.status(400).json({ error: "Explicit push confirmation is required." });
        return;
      }
      if (
        task.status !== "draft" ||
        task.testStatus !== "passed" ||
        !task.featureBranch ||
        !task.baseCommitSha
      ) {
        res.status(400).json({
          error: "A draft can be pushed only after its tests pass in the isolated sandbox.",
        });
        return;
      }
      const [claim] = await db
        .update(agentTasksTable)
        .set({ status: "pushing", updatedAt: new Date() })
        .where(
          and(
            eq(agentTasksTable.id, task.id),
            eq(agentTasksTable.status, "draft"),
            eq(agentTasksTable.testStatus, "passed"),
          ),
        )
        .returning({ id: agentTasksTable.id });
      if (!claim) {
        res.status(409).json({ error: "This task is already being processed." });
        return;
      }

      const changes = await db
        .select()
        .from(agentTaskFilesTable)
        .where(eq(agentTaskFilesTable.taskId, task.id));
      if (changes.length === 0) {
        await updateAgentTask(task.id, { status: "draft" });
        res.status(400).json({ error: "There are no proposed file changes to push." });
        return;
      }
      const [owner, repo] = task.repositoryFullName.split("/");
      if (!owner || !repo) throw new GitHubApiError(400, "invalid_request");
      const githubChanges = changes.map((change) => ({
        path: change.path,
        operation: change.operation === "delete" ? "delete" as const : "upsert" as const,
        content: change.afterContent,
      }));
      const result = await createGitHubClient().pushChanges(
        owner,
        repo,
        task.featureBranch,
        task.baseBranch,
        task.baseCommitSha,
        `AgentMilton: ${task.title.replace(/[\r\n]+/g, " ").slice(0, 180)}`,
        githubChanges,
      );
      await updateAgentTask(task.id, {
        status: "pushed",
        progress: 100,
        approvalAt: new Date(),
        commitSha: result.commitSha,
        failureCode: null,
      });
      await addAgentTaskEvent(
        task.id,
        "changes_pushed",
        `Pushed the approved commit ${result.commitSha.slice(0, 12)} to ${task.featureBranch}.`,
        { commitSha: result.commitSha },
      );
      await respondWithTask(res, task.id);
    } catch (error) {
      if (taskId) {
        await updateAgentTask(taskId, { status: "draft" }).catch(() => undefined);
      }
      if (error instanceof Error && error.name === "ZodError") {
        res.status(400).json({ error: "Explicit push confirmation is required." });
      } else sendError(res, error);
    }
  },
);

router.post(
  "/agent/tasks/:taskId/pull-request",
  requireOwner,
  requireChangedPassword,
  async (req, res): Promise<void> => {
    try {
      const params = CreateAgentTaskPullRequestParams.parse(req.params);
      const input = CreateAgentTaskPullRequestBody.parse(req.body);
      const task = await getAgentTask(params.taskId);
      if (!task) {
        res.status(404).json({ error: "Task not found." });
        return;
      }
      if (task.pullRequestUrl) {
        await respondWithTask(res, task.id, 201);
        return;
      }
      if (
        !["pushed", "pull_request"].includes(task.status) ||
        !task.featureBranch
      ) {
        res.status(400).json({ error: "Push the approved feature branch before opening a pull request." });
        return;
      }
      const [owner, repo] = task.repositoryFullName.split("/");
      if (!owner || !repo) throw new GitHubApiError(400, "invalid_request");
      const pullRequest = await createGitHubClient().createPullRequest(
        owner,
        repo,
        task.baseBranch,
        task.featureBranch,
        input.title,
        input.body,
      );
      await updateAgentTask(task.id, {
        status: "pull_request",
        pullRequestUrl: pullRequest.htmlUrl,
      });
      await addAgentTaskEvent(
        task.id,
        "pull_request_created",
        "Created a pull request. It has not been merged.",
        { pullRequestUrl: pullRequest.htmlUrl },
      );
      await respondWithTask(res, task.id, 201);
    } catch (error) {
      if (error instanceof Error && error.name === "ZodError") {
        res.status(400).json({ error: "Enter a valid pull request title and description." });
      } else sendError(res, error);
    }
  },
);

export default router;
