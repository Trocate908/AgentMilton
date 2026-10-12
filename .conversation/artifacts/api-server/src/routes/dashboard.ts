import { Router, type IRouter } from "express";
import { GetDashboardOverviewResponse } from "@workspace/api-zod";
import { requireChangedPassword, requireOwner } from "../lib/owner-auth";

const router: IRouter = Router();

router.get(
  "/dashboard",
  requireOwner,
  requireChangedPassword,
  (req, res): void => {
    const owner = req.ownerAccount;
    if (!owner) {
      res.status(401).json({ error: "Authentication required." });
      return;
    }

    const data = GetDashboardOverviewResponse.parse({
      ownerUsername: owner.username,
      github: { configured: false, label: "GitHub" },
      openRouter: { configured: false, label: "OpenRouter" },
      gemini: { configured: false, label: "Gemini" },
      deepseek: { configured: false, label: "DeepSeek" },
      activeTaskCount: 0,
      recentTasks: [],
    });
    res.json(data);
  },
);

export default router;
