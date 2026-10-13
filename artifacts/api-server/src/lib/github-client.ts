const API_ROOT = "https://api.github.com";
const DEFAULT_GITHUB_USERNAME = "Trocate908";
const API_VERSION = "2022-11-28";
const MAX_TEXT_FILE_BYTES = 1_000_000;
const BLOCKED_PATH_PARTS = new Set([".git", "node_modules"]);

export class GitHubApiError extends Error {
  constructor(
    readonly status: number,
    readonly code:
      | "authentication"
      | "permission"
      | "not_found"
      | "rate_limited"
      | "invalid_request"
      | "branch_moved"
      | "unavailable",
  ) {
    super(githubErrorMessage(code));
    this.name = "GitHubApiError";
  }
}

function githubErrorMessage(
  code: GitHubApiError["code"],
): string {
  switch (code) {
    case "authentication":
      return "The connected GitHub account could not authorize this request.";
    case "permission":
      return "The connected GitHub account does not have permission for this operation.";
    case "not_found":
      return "The requested repository, branch, file, or commit was not found.";
    case "rate_limited":
      return "GitHub rate limits are active. Try again after the limit resets.";
    case "invalid_request":
      return "GitHub rejected the request. Check the repository, branch, and file path.";
    case "branch_moved":
      return "The feature branch changed since this task was prepared. No force push was attempted.";
    default:
      return "The GitHub API is temporarily unavailable.";
  }
}

export interface GitHubRepository {
  id: number;
  name: string;
  fullName: string;
  private: boolean;
  defaultBranch: string;
  description: string | null;
  htmlUrl: string;
  updatedAt: string | null;
}

export interface GitHubBranch {
  name: string;
  commitSha: string;
  protected: boolean;
}

export interface GitHubTreeEntry {
  path: string;
  type: "file" | "directory";
  size: number | null;
  mode?: string;
  sha?: string;
}

export interface GitHubTextFile {
  path: string;
  ref: string;
  sha: string;
  size: number;
  content: string;
  htmlUrl: string;
}

export interface GitHubCommit {
  sha: string;
  message: string;
  authorName: string | null;
  authorDate: string | null;
  htmlUrl: string;
}

export interface GitHubTreeSnapshot {
  ref: string;
  sha: string;
  treeSha: string;
  entries: GitHubTreeEntry[];
  truncated: boolean;
}

export interface GitHubChange {
  path: string;
  operation: "upsert" | "delete";
  content: string | null;
}

export interface GitHubPushResult {
  commitSha: string;
}

export interface GitHubPullRequestResult {
  htmlUrl: string;
}

function validateIdentifier(value: string, label: string): string {
  if (!/^[A-Za-z0-9_.-]{1,100}$/.test(value) || value === "." || value === "..") {
    throw new GitHubApiError(400, "invalid_request");
  }
  return value;
}

export function validateGitHubPath(path: string): string {
  if (
    typeof path !== "string" ||
    path.length > 1000 ||
    path.startsWith("/") ||
    path.includes("\\") ||
    path.split("/").some((part) => !part || part === "." || part === ".." || BLOCKED_PATH_PARTS.has(part))
  ) {
    throw new GitHubApiError(400, "invalid_request");
  }
  return path;
}

function isSensitivePath(path: string): boolean {
  const name = path.split("/").pop()?.toLowerCase() ?? "";
  return (
    name === ".env" ||
    (name.startsWith(".env.") && name !== ".env.example") ||
    /\.(?:pem|key|p12|pfx|jks|keystore)$/i.test(name) ||
    name === "credentials" ||
    name === "credentials.json" ||
    name === "secrets.yaml" ||
    name === "secrets.yml"
  );
}

function repositoryPath(owner: string, repo: string): string {
  return `/repos/${encodeURIComponent(validateIdentifier(owner, "owner"))}/${encodeURIComponent(validateIdentifier(repo, "repo"))}`;
}

function encodeRef(ref: string): string {
  if (
    !ref ||
    ref.length > 250 ||
    ref.startsWith("-") ||
    ref.startsWith("/") ||
    ref.endsWith("/") ||
    ref.includes("..") ||
    /[\x00-\x20~^:?*[\\]/.test(ref)
  ) {
    throw new GitHubApiError(400, "invalid_request");
  }
  return ref.split("/").map(encodeURIComponent).join("/");
}

function encodeFilePath(path: string): string {
  return validateGitHubPath(path).split("/").map(encodeURIComponent).join("/");
}

function statusError(status: number, rateLimitRemaining: string | null): GitHubApiError {
  if (status === 401) return new GitHubApiError(status, "authentication");
  if (status === 404) return new GitHubApiError(status, "not_found");
  if (status === 422) return new GitHubApiError(status, "invalid_request");
  if (status === 403 && rateLimitRemaining === "0") {
    return new GitHubApiError(status, "rate_limited");
  }
  if (status === 403 || status === 404) return new GitHubApiError(status, "permission");
  if (status === 409) return new GitHubApiError(status, "branch_moved");
  if (status === 429) return new GitHubApiError(status, "rate_limited");
  return new GitHubApiError(status, "unavailable");
}

function hasNextPage(link: string | null): boolean {
  return Boolean(link && /rel="next"/.test(link));
}

export class GitHubClient {
  private readonly proxyFetch: typeof fetch;
  private readonly token = process.env.GITHUB_TOKEN?.trim();

  constructor() {
    this.proxyFetch = fetch;
  }

  private async request<T>(
    path: string,
    options: { method?: "GET" | "POST" | "PATCH"; body?: unknown } = {},
  ): Promise<{ data: T; headers: Headers }> {
    let response: Response;
    try {
      response = await this.proxyFetch(`${API_ROOT}${path}`, {
        method: options.method ?? "GET",
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": API_VERSION,
          "Content-Type": "application/json",
          "User-Agent": "AgentMilton",
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        redirect: "error",
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      throw new GitHubApiError(503, "unavailable");
    }
    if (!response.ok) {
      throw statusError(response.status, response.headers.get("x-ratelimit-remaining"));
    }
    if (response.status === 204) {
      return { data: undefined as T, headers: response.headers };
    }
    try {
      return { data: (await response.json()) as T, headers: response.headers };
    } catch {
      throw new GitHubApiError(502, "unavailable");
    }
  }

  async getUser(): Promise<string | null> {
    if (!this.token) return process.env.GITHUB_USERNAME?.trim() || DEFAULT_GITHUB_USERNAME;
    const { data } = await this.request<{ login?: unknown }>("/user");
    return typeof data.login === "string" ? data.login : null;
  }

  async listRepositories(
    page: number,
    perPage: number,
  ): Promise<{ repositories: GitHubRepository[]; hasNext: boolean }> {
    const username = process.env.GITHUB_USERNAME?.trim() || DEFAULT_GITHUB_USERNAME;
    const endpoint = this.token
      ? `/user/repos?type=all&sort=updated&per_page=${perPage}&page=${page}`
      : `/users/${encodeURIComponent(username)}/repos?type=owner&sort=updated&per_page=${perPage}&page=${page}`;
    const { data, headers } = await this.request<
      Array<Record<string, unknown>>
    >(endpoint);
    return {
      repositories: data.map((item) => ({
        id: Number(item.id),
        name: String(item.name ?? ""),
        fullName: String(item.full_name ?? ""),
        private: Boolean(item.private),
        defaultBranch: String(item.default_branch ?? ""),
        description: typeof item.description === "string" ? item.description : null,
        htmlUrl: String(item.html_url ?? ""),
        updatedAt: typeof item.updated_at === "string" ? item.updated_at : null,
      })),
      hasNext: hasNextPage(headers.get("link")),
    };
  }

  async listBranches(
    owner: string,
    repo: string,
    page: number,
    perPage: number,
  ): Promise<{ branches: GitHubBranch[]; hasNext: boolean }> {
    const { data, headers } = await this.request<
      Array<{ name?: unknown; protected?: unknown; commit?: { sha?: unknown } }>
    >(`${repositoryPath(owner, repo)}/branches?per_page=${perPage}&page=${page}`);
    return {
      branches: data.map((branch) => ({
        name: String(branch.name ?? ""),
        commitSha: String(branch.commit?.sha ?? ""),
        protected: Boolean(branch.protected),
      })),
      hasNext: hasNextPage(headers.get("link")),
    };
  }

  async getBranch(owner: string, repo: string, branch: string): Promise<GitHubBranch> {
    const { data } = await this.request<{
      name?: unknown;
      protected?: unknown;
      commit?: { sha?: unknown };
    }>(`${repositoryPath(owner, repo)}/branches/${encodeRef(branch)}`);
    return {
      name: String(data.name ?? branch),
      commitSha: String(data.commit?.sha ?? ""),
      protected: Boolean(data.protected),
    };
  }

  async getTree(owner: string, repo: string, ref: string): Promise<GitHubTreeSnapshot> {
    const branch = await this.getBranch(owner, repo, ref);
    return this.getTreeAtSha(owner, repo, branch.commitSha, ref);
  }

  async getTreeAtSha(
    owner: string,
    repo: string,
    commitSha: string,
    refLabel = commitSha,
  ): Promise<GitHubTreeSnapshot> {
    const { data } = await this.request<{
      sha?: unknown;
      truncated?: unknown;
      tree?: Array<Record<string, unknown>>;
    }>(`${repositoryPath(owner, repo)}/git/trees/${encodeURIComponent(commitSha)}?recursive=1`);
    return {
      ref: refLabel,
      sha: commitSha,
      treeSha: String(data.sha ?? ""),
      truncated: Boolean(data.truncated),
      entries: (data.tree ?? []).flatMap((entry) => {
        const path = typeof entry.path === "string" ? entry.path : "";
        const type = entry.type === "tree" ? "directory" : entry.type === "blob" ? "file" : null;
        if (!path || !type) return [];
        return [{
          path,
          type,
          size: typeof entry.size === "number" ? entry.size : null,
          mode: typeof entry.mode === "string" ? entry.mode : undefined,
          sha: typeof entry.sha === "string" ? entry.sha : undefined,
        }];
      }),
    };
  }

  async listTree(
    owner: string,
    repo: string,
    ref: string,
    directory: string,
  ): Promise<{ entries: GitHubTreeEntry[]; truncated: boolean }> {
    const prefix = directory ? `${validateGitHubPath(directory)}/` : "";
    const tree = await this.getTree(owner, repo, ref);
    const children = new Map<string, GitHubTreeEntry>();
    for (const item of tree.entries) {
      if (!item.path.startsWith(prefix)) continue;
      const remainder = item.path.slice(prefix.length);
      if (!remainder) continue;
      const slash = remainder.indexOf("/");
      if (slash < 0) {
        children.set(remainder, item);
      } else {
        const childPath = `${prefix}${remainder.slice(0, slash)}`;
        children.set(remainder.slice(0, slash), {
          path: childPath,
          type: "directory",
          size: null,
        });
      }
    }
    return {
      entries: [...children.values()]
        .sort((left, right) =>
          left.type === right.type
            ? left.path.localeCompare(right.path)
            : left.type === "directory"
              ? -1
              : 1,
        )
        .slice(0, 1000)
        .map(({ path, type, size }) => ({ path, type, size })),
      truncated: tree.truncated,
    };
  }

  async getFile(owner: string, repo: string, ref: string, path: string): Promise<GitHubTextFile> {
    const safePath = validateGitHubPath(path);
    if (isSensitivePath(safePath)) {
      throw new GitHubApiError(403, "permission");
    }
    const { data } = await this.request<{
      path?: unknown;
      sha?: unknown;
      size?: unknown;
      content?: unknown;
      encoding?: unknown;
      html_url?: unknown;
    }>(
      `${repositoryPath(owner, repo)}/contents/${encodeFilePath(safePath)}?ref=${encodeURIComponent(ref)}`,
    );
    const size = Number(data.size ?? 0);
    if (size > MAX_TEXT_FILE_BYTES) throw new GitHubApiError(413, "invalid_request");
    if (data.encoding !== "base64" || typeof data.content !== "string") {
      throw new GitHubApiError(415, "invalid_request");
    }
    const content = Buffer.from(data.content.replace(/\s/g, ""), "base64").toString("utf8");
    if (content.includes("\u0000")) throw new GitHubApiError(415, "invalid_request");
    return {
      path: String(data.path ?? safePath),
      ref,
      sha: String(data.sha ?? ""),
      size,
      content,
      htmlUrl: String(data.html_url ?? ""),
    };
  }

  async listCommits(
    owner: string,
    repo: string,
    sha: string | undefined,
    page: number,
    perPage: number,
  ): Promise<{ commits: GitHubCommit[]; hasNext: boolean }> {
    const query = new URLSearchParams({ per_page: String(perPage), page: String(page) });
    if (sha) query.set("sha", sha);
    const { data, headers } = await this.request<
      Array<{
        sha?: unknown;
        html_url?: unknown;
        commit?: {
          message?: unknown;
          author?: { name?: unknown; date?: unknown } | null;
        };
      }>
    >(`${repositoryPath(owner, repo)}/commits?${query}`);
    return {
      commits: data.map((commit) => ({
        sha: String(commit.sha ?? ""),
        message: String(commit.commit?.message ?? ""),
        authorName:
          typeof commit.commit?.author?.name === "string"
            ? commit.commit.author.name
            : null,
        authorDate:
          typeof commit.commit?.author?.date === "string"
            ? commit.commit.author.date
            : null,
        htmlUrl: String(commit.html_url ?? ""),
      })),
      hasNext: hasNextPage(headers.get("link")),
    };
  }

  async createBranch(
    owner: string,
    repo: string,
    branch: string,
    baseSha: string,
  ): Promise<void> {
    await this.request(`${repositoryPath(owner, repo)}/git/refs`, {
      method: "POST",
      body: { ref: `refs/heads/${branch}`, sha: baseSha },
    });
  }

  async pushChanges(
    owner: string,
    repo: string,
    branch: string,
    baseBranch: string,
    baseCommitSha: string,
    message: string,
    changes: GitHubChange[],
  ): Promise<GitHubPushResult> {
    const branchRef = `heads/${encodeRef(branch)}`;
    const currentBranch = await this.request<{ object?: { sha?: unknown } }>(
      `${repositoryPath(owner, repo)}/git/ref/${branchRef}`,
    );
    if (currentBranch.data.object?.sha !== baseCommitSha) {
      throw new GitHubApiError(409, "branch_moved");
    }

    const tree = await this.request<{ tree?: Array<Record<string, unknown>> }>(
      `${repositoryPath(owner, repo)}/git/trees/${encodeURIComponent(baseCommitSha)}?recursive=1`,
    );
    const originalModes = new Map(
      (tree.data.tree ?? [])
        .filter((entry) => typeof entry.path === "string")
        .map((entry) => [String(entry.path), String(entry.mode ?? "100644")]),
    );

    const entries = [];
    for (const change of changes) {
      const path = validateGitHubPath(change.path);
      if (isSensitivePath(path)) throw new GitHubApiError(403, "permission");
      if (change.operation === "delete") {
        entries.push({ path, mode: originalModes.get(path) ?? "100644", type: "blob", sha: null });
        continue;
      }
      if (typeof change.content !== "string") {
        throw new GitHubApiError(400, "invalid_request");
      }
      const blob = await this.request<{ sha?: unknown }>(
        `${repositoryPath(owner, repo)}/git/blobs`,
        {
          method: "POST",
          body: { content: change.content, encoding: "utf-8" },
        },
      );
      entries.push({
        path,
        mode: originalModes.get(path) === "100755" ? "100755" : "100644",
        type: "blob",
        sha: String(blob.data.sha ?? ""),
      });
    }
    const baseTree = await this.request<{ tree?: { sha?: unknown } }>(
      `${repositoryPath(owner, repo)}/git/commits/${encodeURIComponent(baseCommitSha)}`,
    );
    const treeResult = await this.request<{ sha?: unknown }>(
      `${repositoryPath(owner, repo)}/git/trees`,
      {
        method: "POST",
        body: {
          base_tree: baseTree.data.tree?.sha,
          tree: entries,
        },
      },
    );
    const commit = await this.request<{ sha?: unknown }>(
      `${repositoryPath(owner, repo)}/git/commits`,
      {
        method: "POST",
        body: {
          message,
          tree: treeResult.data.sha,
          parents: [baseCommitSha],
        },
      },
    );
    const commitSha = String(commit.data.sha ?? "");
    if (!commitSha) throw new GitHubApiError(502, "unavailable");

    await this.request(`${repositoryPath(owner, repo)}/git/refs/${branchRef}`, {
      method: "PATCH",
      body: { sha: commitSha, force: false },
    });
    return { commitSha };
  }

  async createPullRequest(
    owner: string,
    repo: string,
    base: string,
    head: string,
    title: string,
    body: string,
  ): Promise<GitHubPullRequestResult> {
    const { data } = await this.request<{ html_url?: unknown }>(
      `${repositoryPath(owner, repo)}/pulls`,
      {
        method: "POST",
        body: { base, head, title, body },
      },
    );
    if (typeof data.html_url !== "string") {
      throw new GitHubApiError(502, "unavailable");
    }
    return { htmlUrl: data.html_url };
  }
}

export function createGitHubClient(): GitHubClient {
  return new GitHubClient();
}

export function isSensitiveRepositoryPath(path: string): boolean {
  try {
    return isSensitivePath(validateGitHubPath(path));
  } catch {
    return true;
  }
}
