import { Router, type IRouter, type Response } from "express";
import {
  GetGitHubRepositoryFileParams,
  GetGitHubRepositoryFileQueryParams,
  GetGitHubRepositoryFileResponse,
  GetGitHubRepositoryTreeParams,
  GetGitHubRepositoryTreeQueryParams,
  GetGitHubRepositoryTreeResponse,
  GetGitHubStatusResponse,
  ListGitHubBranchesParams,
  ListGitHubBranchesQueryParams,
  ListGitHubBranchesResponse,
  ListGitHubCommitsParams,
  ListGitHubCommitsQueryParams,
  ListGitHubCommitsResponse,
  ListGitHubRepositoriesQueryParams,
  ListGitHubRepositoriesResponse,
} from "@workspace/api-zod";
import { createGitHubClient, GitHubApiError } from "../lib/github-client";
import { requireChangedPassword, requireOwner } from "../lib/owner-auth";

const router: IRouter = Router();

function githubStatus(error: GitHubApiError): number {
  if ([400, 403, 404, 409, 429].includes(error.status)) return error.status;
  return 502;
}

function sendGitHubError(res: Response, error: unknown): void {
  if (error instanceof GitHubApiError) {
    res.status(githubStatus(error)).json({ error: error.message });
    return;
  }
  res.status(502).json({ error: "The GitHub API is temporarily unavailable." });
}

router.get(
  "/github/status",
  requireOwner,
  requireChangedPassword,
  async (_req, res): Promise<void> => {
    try {
      const username = await createGitHubClient().getUser();
      res.json(GetGitHubStatusResponse.parse({ connected: true, username }));
    } catch (error) {
      sendGitHubError(res, error);
    }
  },
);

router.get(
  "/github/repositories",
  requireOwner,
  requireChangedPassword,
  async (req, res): Promise<void> => {
    try {
      const query = ListGitHubRepositoriesQueryParams.parse(req.query);
      const result = await createGitHubClient().listRepositories(query.page, query.per_page);
      res.json(
        ListGitHubRepositoriesResponse.parse({
          repositories: result.repositories,
          page: query.page,
          perPage: query.per_page,
          hasNext: result.hasNext,
        }),
      );
    } catch (error) {
      if (error instanceof GitHubApiError) sendGitHubError(res, error);
      else if (error instanceof Error && error.name === "ZodError") {
        res.status(400).json({ error: "Invalid repository pagination." });
      } else res.status(502).json({ error: "The GitHub API is temporarily unavailable." });
    }
  },
);

router.get(
  "/github/repositories/:owner/:repo/branches",
  requireOwner,
  requireChangedPassword,
  async (req, res): Promise<void> => {
    try {
      const params = ListGitHubBranchesParams.parse(req.params);
      const query = ListGitHubBranchesQueryParams.parse(req.query);
      const result = await createGitHubClient().listBranches(
        params.owner,
        params.repo,
        query.page,
        query.per_page,
      );
      res.json(
        ListGitHubBranchesResponse.parse({
          branches: result.branches,
          page: query.page,
          perPage: query.per_page,
          hasNext: result.hasNext,
        }),
      );
    } catch (error) {
      if (error instanceof GitHubApiError) sendGitHubError(res, error);
      else if (error instanceof Error && error.name === "ZodError") {
        res.status(400).json({ error: "Invalid repository or pagination." });
      } else res.status(502).json({ error: "The GitHub API is temporarily unavailable." });
    }
  },
);

router.get(
  "/github/repositories/:owner/:repo/tree",
  requireOwner,
  requireChangedPassword,
  async (req, res): Promise<void> => {
    try {
      const params = GetGitHubRepositoryTreeParams.parse(req.params);
      const query = GetGitHubRepositoryTreeQueryParams.parse(req.query);
      const result = await createGitHubClient().listTree(
        params.owner,
        params.repo,
        query.ref,
        query.path,
      );
      res.json(
        GetGitHubRepositoryTreeResponse.parse({
          ref: query.ref,
          path: query.path,
          entries: result.entries,
          truncated: result.truncated,
        }),
      );
    } catch (error) {
      if (error instanceof GitHubApiError) sendGitHubError(res, error);
      else if (error instanceof Error && error.name === "ZodError") {
        res.status(400).json({ error: "Invalid repository, branch, or path." });
      } else res.status(502).json({ error: "The GitHub API is temporarily unavailable." });
    }
  },
);

router.get(
  "/github/repositories/:owner/:repo/file",
  requireOwner,
  requireChangedPassword,
  async (req, res): Promise<void> => {
    try {
      const params = GetGitHubRepositoryFileParams.parse(req.params);
      const query = GetGitHubRepositoryFileQueryParams.parse(req.query);
      const file = await createGitHubClient().getFile(
        params.owner,
        params.repo,
        query.ref,
        query.path,
      );
      res.json(GetGitHubRepositoryFileResponse.parse(file));
    } catch (error) {
      if (error instanceof GitHubApiError) {
        if (error.status === 415 || error.status === 413) {
          res.status(400).json({ error: "This file is binary or exceeds the 1 MB viewer limit." });
        } else sendGitHubError(res, error);
      } else if (error instanceof Error && error.name === "ZodError") {
        res.status(400).json({ error: "Invalid repository, branch, or file path." });
      } else res.status(502).json({ error: "The GitHub API is temporarily unavailable." });
    }
  },
);

router.get(
  "/github/repositories/:owner/:repo/commits",
  requireOwner,
  requireChangedPassword,
  async (req, res): Promise<void> => {
    try {
      const params = ListGitHubCommitsParams.parse(req.params);
      const query = ListGitHubCommitsQueryParams.parse(req.query);
      const result = await createGitHubClient().listCommits(
        params.owner,
        params.repo,
        query.sha,
        query.page,
        query.per_page,
      );
      res.json(
        ListGitHubCommitsResponse.parse({
          commits: result.commits,
          page: query.page,
          perPage: query.per_page,
          hasNext: result.hasNext,
        }),
      );
    } catch (error) {
      if (error instanceof GitHubApiError) sendGitHubError(res, error);
      else if (error instanceof Error && error.name === "ZodError") {
        res.status(400).json({ error: "Invalid repository or commit query." });
      } else res.status(502).json({ error: "The GitHub API is temporarily unavailable." });
    }
  },
);

export default router;
