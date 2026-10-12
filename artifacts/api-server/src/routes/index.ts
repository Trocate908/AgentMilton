import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import dashboardRouter from "./dashboard";
import githubRouter from "./github";
import aiRouter from "./ai";
import agentRouter from "./agent";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(dashboardRouter);
router.use(githubRouter);
router.use(aiRouter);
router.use(agentRouter);

export default router;
