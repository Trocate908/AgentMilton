import { Router, type IRouter } from "express";
import { GetDashboardOverviewResponse } from "@workspace/api-zod";
import { count, desc, inArray } from "drizzle-orm";
import { agentTasksTable, db } from "@workspace/db";
import { hasProviderKey, listProviderModels } from "../lib/ai-providers";
import { createGitHubClient } from "../lib/github-client";
import { requireChangedPassword, requireOwner } from "../lib/owner-auth";

const router: IRouter = Router();

router.get(
  "/dashboard",
  requireOwner,
  requireChangedPassword,
  async (req, res): Promise<void> => {
    const owner = req.ownerAccount;
    if (!owner) {
      res.status(401).json({ error: "Authentication required." });
      return;
    }

    const [githubUsername, openRouterAvailable] = await Promise.all([
      createGitHubClient().getUser().catch(() => null),
      hasProviderKey("openrouter")
        ? listProviderModels("openrouter")
            .then((models) => models.length > 0)
            .catch(() => false)
        : Promise.resolve(false),
    ]);

    const activeStatuses = [
      "queued",
      "inspecting",
      "planning",
      "generating",
      "draft",
      "testing",
      "tests_passed",
      "tests_failed",
      "test_blocked",
      "pushing",
    ];
    const [activeRows, tasks] = await Promise.all([
      db
        .select({ total: count() })
        .from(agentTasksTable)
        .where(inArray(agentTasksTable.status, activeStatuses)),
      db
        .select({
          id: agentTasksTable.id,
          title: agentTasksTable.title,
          status: agentTasksTable.status,
          updatedAt: agentTasksTable.updatedAt,
        })
        .from(agentTasksTable)
        .orderBy(desc(agentTasksTable.updatedAt))
        .limit(6),
    ]);

    const data = GetDashboardOverviewResponse.parse({
      ownerUsername: owner.username,
      github: {
        configured: githubUsername !== null,
        label: githubUsername ? `GitHub · ${githubUsername}` : "GitHub",
      },
      openRouter: {
        configured: openRouterAvailable,
        label: "OpenRouter",
      },
      activeTaskCount: activeRows[0]?.total ?? 0,
      recentTasks: tasks,
    });
    res.json(data);
  },
);

export default router;
