import { and, asc, eq } from "drizzle-orm";
import { z } from "zod/v4";
import {
  agentTaskFilesTable,
  agentTaskMessagesTable,
  db,
  type AgentTask,
} from "@workspace/db";
import {
  createAgentCompletion,
  type AiProvider,
  type ChatMessage,
  type ProviderSettings,
  ProviderApiError,
} from "./ai-providers";
import { getOrCreateAgentSettings } from "./agent-settings";
import {
  addAgentTaskEvent,
  addAgentTaskMessage,
  getAgentTask,
  replaceAgentTaskFiles,
  updateAgentTask,
} from "./agent-task-store";
import {
  createGitHubClient,
  GitHubApiError,
  isSensitiveRepositoryPath,
  type GitHubTextFile,
  type GitHubTreeEntry,
} from "./github-client";
import { containsLikelySecret, redactLikelySecrets } from "./secret-scanner";

const MAX_TREE_PATHS_IN_PROMPT = 500;
const MAX_CONTEXT_FILES = 18;
const MAX_FILE_CONTEXT_BYTES = 34_000;
const MAX_TOTAL_CONTEXT_BYTES = 180_000;
const MAX_CHANGED_FILES = 25;
const MAX_CHANGED_FILE_BYTES = 100_000;
const MAX_TOTAL_CHANGE_BYTES = 650_000;

const planningResultSchema = z.object({
  title: z.string().min(1).max(120),
  summary: z.string().min(1).max(2000),
  plan: z.array(z.string().min(1).max(500)).max(15),
  filesToRead: z.array(z.string().min(1).max(1000)).max(12),
});

const editResultSchema = z.object({
  title: z.string().min(1).max(120),
  summary: z.string().min(1).max(2000),
  plan: z.array(z.string().min(1).max(500)).max(15),
  changes: z
    .array(
      z.object({
        path: z.string().min(1).max(1000),
        action: z.enum(["add", "update", "delete"]),
        content: z.string().max(MAX_CHANGED_FILE_BYTES).optional(),
      }),
    )
    .max(MAX_CHANGED_FILES),
});

interface ProposedChange {
  path: string;
  operation: "upsert" | "delete";
  beforeContent: string | null;
  afterContent: string | null;
  baseSha: string | null;
}

function splitRepository(fullName: string): [string, string] {
  const parts = fullName.split("/");
  if (
    parts.length !== 2 ||
    !/^[A-Za-z0-9_.-]{1,100}$/.test(parts[0]!) ||
    !/^[A-Za-z0-9_.-]{1,100}$/.test(parts[1]!)
  ) {
    throw new GitHubApiError(400, "invalid_request");
  }
  return [parts[0]!, parts[1]!];
}

function isForbiddenAgentPath(path: string): boolean {
  return (
    isSensitiveRepositoryPath(path) ||
    /^\.github\/workflows(?:\/|$)/i.test(path) ||
    /^\.ssh(?:\/|$)/i.test(path)
  );
}

function isTextPath(path: string): boolean {
  const name = path.split("/").pop() ?? "";
  return (
    /(?:\.|^)(?:md|mdx|txt|json|jsonc|ya?ml|toml|ini|ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|swift|css|scss|html|vue|svelte|sh|sql|prisma|graphql|gql|proto|xml|conf|h|c|cc|cpp|rb|php|dart|ex|exs|lock)$/i.test(
      name,
    ) ||
    ["Dockerfile", "Makefile", "Gemfile", "Justfile", "Procfile"].includes(name)
  );
}

function filePriority(path: string, promptWords: Set<string>): number {
  const basename = path.split("/").pop()?.toLowerCase() ?? "";
  if (/^(readme|agents|contributing)(\.|$)/i.test(basename)) return 0;
  if (/^(package\.json|pyproject\.toml|go\.mod|cargo\.toml|composer\.json)$/i.test(basename)) return 1;
  if (/^(tsconfig|vite\.config|next\.config|pytest\.ini|justfile|makefile)/i.test(basename)) return 2;
  if (/^(app|main|index|page)\.(tsx?|jsx?|py|go|rs|html)$/i.test(basename)) return 3;
  const words = path.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return words.some((word) => promptWords.has(word)) ? 4 : 10;
}

function selectInitialPaths(entries: GitHubTreeEntry[], prompt: string): string[] {
  const promptWords = new Set(
    prompt
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 3),
  );
  return entries
    .filter(
      (entry) =>
        entry.type === "file" &&
        (entry.size === null || entry.size <= MAX_FILE_CONTEXT_BYTES) &&
        isTextPath(entry.path) &&
        !isForbiddenAgentPath(entry.path),
    )
    .sort(
      (left, right) =>
        filePriority(left.path, promptWords) - filePriority(right.path, promptWords) ||
        left.path.localeCompare(right.path),
    )
    .slice(0, MAX_CONTEXT_FILES)
    .map((entry) => entry.path);
}

function parseModelJson(content: string): unknown {
  const trimmed = content.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const start = withoutFence.indexOf("{");
  const end = withoutFence.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new ProviderApiError("invalid_response", 502, false);
  }
  try {
    return JSON.parse(withoutFence.slice(start, end + 1));
  } catch {
    throw new ProviderApiError("invalid_response", 502, false);
  }
}

function asProviderSettings(settings: Awaited<ReturnType<typeof getOrCreateAgentSettings>>): ProviderSettings {
  return {
    primaryProvider: settings.primaryProvider,
    primaryModel: settings.primaryModel,
    fallbackProvider: settings.fallbackProvider,
    fallbackModel: settings.fallbackModel,
    allowPaidModels: settings.allowPaidModels,
    allowPaidFallback: settings.allowPaidFallback,
  };
}

async function recordUsage(taskId: string, usage: {
  promptTokens: number;
  completionTokens: number;
  estimatedCostUsd: number | null;
  fallbackUsed: boolean;
  provider: AiProvider;
  model: string;
}): Promise<void> {
  const task = await getAgentTask(taskId);
  if (!task) return;
  const currentCost =
    task.estimatedCostUsd === null ? null : Number(task.estimatedCostUsd);
  const nextCost =
    currentCost === null || usage.estimatedCostUsd === null
      ? null
      : currentCost + usage.estimatedCostUsd;
  await updateAgentTask(taskId, {
    promptTokens: task.promptTokens + usage.promptTokens,
    completionTokens: task.completionTokens + usage.completionTokens,
    estimatedCostUsd: nextCost === null ? null : nextCost.toFixed(10),
  });
  if (usage.fallbackUsed) {
    await addAgentTaskEvent(
      taskId,
      "provider_fallback",
      `The primary provider failed recoverably. The task continued with ${usage.provider} / ${usage.model}.`,
      { provider: usage.provider, model: usage.model },
    );
  }
}

async function readContextFile(
  client: ReturnType<typeof createGitHubClient>,
  owner: string,
  repo: string,
  baseSha: string,
  path: string,
): Promise<GitHubTextFile | null> {
  if (isForbiddenAgentPath(path)) return null;
  try {
    const file = await client.getFile(owner, repo, baseSha, path);
    if (containsLikelySecret(file.content)) return null;
    return {
      ...file,
      content: redactLikelySecrets(file.content).slice(0, MAX_FILE_CONTEXT_BYTES),
    };
  } catch {
    return null;
  }
}

async function readSelectedFiles(
  client: ReturnType<typeof createGitHubClient>,
  owner: string,
  repo: string,
  baseSha: string,
  paths: string[],
): Promise<Map<string, GitHubTextFile>> {
  const files = new Map<string, GitHubTextFile>();
  let totalBytes = 0;
  for (let offset = 0; offset < paths.length; offset += 5) {
    const batch = await Promise.all(
      paths.slice(offset, offset + 5).map((path) =>
        readContextFile(client, owner, repo, baseSha, path),
      ),
    );
    for (const file of batch) {
      if (!file || files.has(file.path)) continue;
      const size = Buffer.byteLength(file.content, "utf8");
      if (totalBytes + size > MAX_TOTAL_CONTEXT_BYTES) continue;
      files.set(file.path, file);
      totalBytes += size;
    }
  }
  return files;
}

function safeModelInput(
  tree: GitHubTreeEntry[],
  files: Map<string, GitHubTextFile>,
): string {
  const paths = tree
    .filter((entry) => !isForbiddenAgentPath(entry.path))
    .slice(0, MAX_TREE_PATHS_IN_PROMPT)
    .map((entry) => `${entry.type === "directory" ? "dir " : "file"} ${entry.path}`);
  const content = [...files.values()]
    .map((file) => `\n--- ${file.path} ---\n${file.content}`)
    .join("\n");
  return `Repository paths (truncated to ${MAX_TREE_PATHS_IN_PROMPT} entries):\n${paths.join("\n")}\n\nRepository text:\n${content}`;
}

function makePatch(path: string, before: string | null, after: string | null): string {
  const oldLines = before === null ? [] : before.split("\n");
  const newLines = after === null ? [] : after.split("\n");
  const oldHeader = before === null ? "/dev/null" : `a/${path}`;
  const newHeader = after === null ? "/dev/null" : `b/${path}`;
  const oldRange = oldLines.length ? `1,${oldLines.length}` : "0,0";
  const newRange = newLines.length ? `1,${newLines.length}` : "0,0";
  return [
    `--- ${oldHeader}`,
    `+++ ${newHeader}`,
    `@@ -${oldRange} +${newRange} @@`,
    ...oldLines.map((line) => `-${line}`),
    ...newLines.map((line) => `+${line}`),
  ].join("\n");
}

function safeTaskMessage(message: string): string {
  return redactLikelySecrets(message).slice(0, 12_000);
}

async function loadExistingChanges(taskId: string): Promise<Map<string, ProposedChange>> {
  const rows = await db
    .select()
    .from(agentTaskFilesTable)
    .where(eq(agentTaskFilesTable.taskId, taskId));
  return new Map(
    rows.map((row) => [
      row.path,
      {
        path: row.path,
        operation: row.operation === "delete" ? "delete" : "upsert",
        beforeContent: row.beforeContent,
        afterContent: row.afterContent,
        baseSha: row.baseSha,
      },
    ]),
  );
}

async function buildDraft(taskId: string): Promise<void> {
  let task = await getAgentTask(taskId);
  if (!task) return;
  await updateAgentTask(taskId, {
    status: task.featureBranch ? "generating" : "inspecting",
    progress: 5,
    failureCode: null,
  });
  await addAgentTaskEvent(
    taskId,
    "inspection_started",
    "Checking the selected repository and branch before preparing edits.",
  );

  const [owner, repo] = splitRepository(task.repositoryFullName);
  const github = createGitHubClient();
  let baseSha = task.baseCommitSha;
  let featureBranch = task.featureBranch;
  if (!baseSha || !featureBranch) {
    const branch = await github.getBranch(owner, repo, task.baseBranch);
    baseSha = branch.commitSha;
    if (!baseSha) throw new GitHubApiError(502, "unavailable");
    featureBranch = `agentmilton/${task.id.slice(0, 12)}`;
    await github.createBranch(owner, repo, featureBranch, baseSha);
    await updateAgentTask(taskId, {
      baseCommitSha: baseSha,
      featureBranch,
      status: "inspecting",
      progress: 15,
    });
    await addAgentTaskEvent(
      taskId,
      "branch_created",
      `Created the isolated feature branch ${featureBranch} from ${task.baseBranch}.`,
    );
  }
  task = (await getAgentTask(taskId))!;

  const tree = await github.getTreeAtSha(owner, repo, baseSha, task.baseBranch);
  if (tree.truncated) {
    throw new ProviderApiError("invalid_response", 413, false);
  }
  const usableEntries = tree.entries.filter(
    (entry) => entry.type === "file" && !isForbiddenAgentPath(entry.path),
  );
  if (usableEntries.length > 12_000) {
    throw new ProviderApiError("invalid_response", 413, false);
  }

  const settings = asProviderSettings(await getOrCreateAgentSettings());
  if (!settings.primaryModel) {
    throw new ProviderApiError("model_unavailable", 400, false);
  }
  const existingChanges = await loadExistingChanges(taskId);
  const ownerMessages = await db
    .select()
    .from(agentTaskMessagesTable)
    .where(
      and(
        eq(agentTaskMessagesTable.taskId, taskId),
        eq(agentTaskMessagesTable.role, "owner"),
      ),
    );
  const requestHistory = ownerMessages
    .map((message, index) => `${index + 1}. ${safeTaskMessage(message.content)}`)
    .join("\n\n");
  const request = requestHistory || safeTaskMessage(task.prompt);
  const initialPaths = selectInitialPaths(usableEntries, request);
  const initialFiles = await readSelectedFiles(
    github,
    owner,
    repo,
    baseSha,
    initialPaths,
  );
  const initialContext = safeModelInput(tree.entries, initialFiles);

  await updateAgentTask(taskId, { status: "planning", progress: 35 });
  await addAgentTaskEvent(
    taskId,
    "repository_read",
    `Read the branch snapshot and ${initialFiles.size} relevant text files before editing.`,
    { filesRead: initialFiles.size, baseCommit: baseSha },
  );

  const planCompletion = await createAgentCompletion(settings, [
    {
      role: "system",
      content:
        "You are AgentMilton, a careful coding agent. First inspect the repository context. Do not propose code edits yet. Return one JSON object with exactly: title (short), summary, plan (array of concise steps), filesToRead (up to 12 existing repository paths needed to understand the request). Select files only from the provided path list. Do not request credentials, environment files, private keys, binary files, or GitHub workflow files. Never claim tests have run.",
    },
    {
      role: "user",
      content: `Repository: ${task.repositoryFullName}\nBase branch: ${task.baseBranch}\nUser request:\n${request}\n\n${initialContext}`,
    },
  ]);
  await recordUsage(taskId, planCompletion);
  const plan = planningResultSchema.safeParse(parseModelJson(planCompletion.content));
  if (!plan.success) throw new ProviderApiError("invalid_response", 502, false);

  const treeFilePaths = new Set(usableEntries.map((entry) => entry.path));
  const extraPaths = plan.data.filesToRead
    .filter(
      (path, index, all) =>
        all.indexOf(path) === index &&
        treeFilePaths.has(path) &&
        isTextPath(path) &&
        !isForbiddenAgentPath(path),
    )
    .slice(0, 12);
  const contextFiles = new Map(initialFiles);
  const extraFiles = await readSelectedFiles(
    github,
    owner,
    repo,
    baseSha,
    extraPaths.filter((path) => !contextFiles.has(path)),
  );
  for (const [path, file] of extraFiles) contextFiles.set(path, file);

  for (const change of existingChanges.values()) {
    if (change.operation === "delete" || change.afterContent === null) {
      contextFiles.delete(change.path);
    } else if (contextFiles.has(change.path)) {
      const file = contextFiles.get(change.path)!;
      contextFiles.set(change.path, { ...file, content: change.afterContent });
    } else if (!isForbiddenAgentPath(change.path)) {
      contextFiles.set(change.path, {
        path: change.path,
        ref: baseSha,
        sha: change.baseSha ?? "",
        size: Buffer.byteLength(change.afterContent, "utf8"),
        content: change.afterContent,
        htmlUrl: "",
      });
    }
  }

  await updateAgentTask(taskId, {
    status: "generating",
    progress: 65,
    title: plan.data.title,
    plan: plan.data.plan,
  });
  await addAgentTaskEvent(
    taskId,
    "plan_ready",
    plan.data.summary,
    { filesRead: contextFiles.size },
  );

  const finalContext = safeModelInput(tree.entries, contextFiles);
  const editCompletion = await createAgentCompletion(settings, [
    {
      role: "system",
      content:
        "You are AgentMilton, a careful coding agent. Produce complete replacement contents for the files that need changes. Return one JSON object with exactly: title, summary, plan (array), changes (array of {path, action: add|update|delete, content for add/update}). Use only the repository conventions and supplied file contents; when adding files, use a path not already in the repository. Never include secrets, tokens, private keys, generated credentials, or environment values. Do not edit .env files, keys, credentials, node_modules, .git, or .github/workflows. Do not modify files you have not read unless adding a new file. Keep changes focused. Return no markdown. Never claim tests were run.",
    },
    {
      role: "user",
      content: `Repository: ${task.repositoryFullName}\nBase branch: ${task.baseBranch}\nFeature branch: ${featureBranch}\nUser request history:\n${request}\n\nCurrent proposed changes are included in the file context. Produce the full final set of changed files.\n\n${finalContext}`,
    },
  ]);
  await recordUsage(taskId, editCompletion);
  const edits = editResultSchema.safeParse(parseModelJson(editCompletion.content));
  if (!edits.success) throw new ProviderApiError("invalid_response", 502, false);
  if (edits.data.changes.length === 0 && existingChanges.size === 0) {
    throw new ProviderApiError("invalid_response", 422, false);
  }

  const treeByPath = new Map(usableEntries.map((entry) => [entry.path, entry]));
  const merged = new Map(existingChanges);
  const seen = new Set<string>();
  for (const rawChange of edits.data.changes) {
    const path = rawChange.path;
    if (
      seen.has(path) ||
      isForbiddenAgentPath(path) ||
      !isTextPath(path) ||
      path.startsWith(".github/workflows/")
    ) {
      throw new ProviderApiError("invalid_response", 400, false);
    }
    seen.add(path);
    const entry = treeByPath.get(path);
    if (rawChange.action === "add" && entry && !existingChanges.has(path)) {
      throw new ProviderApiError("invalid_response", 400, false);
    }
    if ((rawChange.action === "update" || rawChange.action === "delete") && !entry) {
      throw new ProviderApiError("invalid_response", 400, false);
    }

    let beforeContent: string | null = null;
    let baseFileSha: string | null = null;
    if (entry) {
      const priorDraft = existingChanges.get(path);
      if (priorDraft) {
        beforeContent = priorDraft.beforeContent;
        baseFileSha = priorDraft.baseSha;
      } else {
        const original = await readContextFile(github, owner, repo, baseSha, path);
        if (!original || containsLikelySecret(original.content)) {
          throw new ProviderApiError("invalid_response", 400, false);
        }
        beforeContent = original.content;
        baseFileSha = entry.sha ?? original.sha;
      }
    }
    const afterContent =
      rawChange.action === "delete" ? null : rawChange.content ?? null;
    if (rawChange.action !== "delete" && afterContent === null) {
      throw new ProviderApiError("invalid_response", 400, false);
    }
    if (
      (afterContent !== null && containsLikelySecret(afterContent)) ||
      (beforeContent !== null && containsLikelySecret(beforeContent))
    ) {
      throw new ProviderApiError("invalid_response", 400, false);
    }
    merged.set(path, {
      path,
      operation: rawChange.action === "delete" ? "delete" : "upsert",
      beforeContent,
      afterContent,
      baseSha: baseFileSha,
    });
  }

  let totalChangeBytes = 0;
  const files = [...merged.values()].map((change) => {
    totalChangeBytes +=
      Buffer.byteLength(change.beforeContent ?? "", "utf8") +
      Buffer.byteLength(change.afterContent ?? "", "utf8");
    return {
      path: change.path,
      operation: change.operation,
      beforeContent: change.beforeContent,
      afterContent: change.afterContent,
      baseSha: change.baseSha,
      patch: makePatch(change.path, change.beforeContent, change.afterContent),
    };
  });
  if (
    files.length > MAX_CHANGED_FILES ||
    totalChangeBytes > MAX_TOTAL_CHANGE_BYTES
  ) {
    throw new ProviderApiError("invalid_response", 413, false);
  }

  await replaceAgentTaskFiles(taskId, files);
  await updateAgentTask(taskId, {
    title: edits.data.title,
    summary: edits.data.summary,
    plan: edits.data.plan,
    status: "draft",
    progress: 100,
    testStatus: "blocked",
    testSuite: null,
    testOutput:
      "No repository code was executed. This runtime has no supported OS sandbox, so tests are blocked.",
    testExitCode: null,
    failureCode: null,
  });
  await addAgentTaskMessage(
    taskId,
    "assistant",
    `Draft prepared with ${files.length} file change${files.length === 1 ? "" : "s"}. Repository tests were not executed because a supported OS sandbox is unavailable.`,
  );
  await addAgentTaskEvent(
    taskId,
    "draft_ready",
    `Prepared a reviewable draft affecting ${files.length} file${files.length === 1 ? "" : "s"}. No commit or push was made.`,
    { changedFileCount: files.length },
  );
  await addAgentTaskEvent(
    taskId,
    "tests_blocked",
    "No repository code was executed. A supported OS sandbox is unavailable, so pushing is disabled until tests can run safely.",
  );
}

function safeFailure(error: unknown): { code: string; message: string } {
  if (error instanceof ProviderApiError) {
    return { code: error.code, message: error.message };
  }
  if (error instanceof GitHubApiError) {
    return { code: `github_${error.code}`, message: error.message };
  }
  return {
    code: "task_failed",
    message: "The task could not be completed. Check the GitHub/provider connection and try again.",
  };
}

export function startAgentTaskGeneration(taskId: string): void {
  void (async () => {
    try {
      await buildDraft(taskId);
    } catch (error) {
      const failure = safeFailure(error);
      await updateAgentTask(taskId, {
        status: "failed",
        progress: 100,
        failureCode: failure.code,
      });
      await addAgentTaskEvent(taskId, "task_failed", failure.message);
      await addAgentTaskMessage(taskId, "assistant", failure.message);
    }
  })();
}

export async function markAgentTaskTestsBlocked(
  task: AgentTask,
  suite: string,
): Promise<void> {
  const output =
    "No repository command was executed. This runtime does not provide a supported isolated filesystem sandbox. Pushing this task is disabled until tests run in a secure sandbox.";
  await updateAgentTask(task.id, {
    status: "draft",
    testStatus: "blocked",
    testSuite: suite,
    testOutput: output,
    testExitCode: null,
  });
  await addAgentTaskEvent(task.id, "tests_blocked", output);
}
