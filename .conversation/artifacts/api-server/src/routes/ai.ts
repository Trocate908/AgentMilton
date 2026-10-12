import { Router, type IRouter, type Response } from "express";
import {
  GetAiSettingsResponse,
  ListAiModelsQueryParams,
  ListAiModelsResponse,
  UpdateAiSettingsBody,
  UpdateAiSettingsResponse,
} from "@workspace/api-zod";
import { eq } from "drizzle-orm";
import {
  type AiProvider,
  getProviderModel,
  hasProviderKey,
  listProviderModels,
  ProviderApiError,
} from "../lib/ai-providers";
import { db, agentSettingsTable } from "@workspace/db";
import { getOrCreateAgentSettings } from "../lib/agent-settings";
import { requireChangedPassword, requireOwner } from "../lib/owner-auth";

const router: IRouter = Router();

function sendProviderError(res: Response, error: unknown): void {
  if (error instanceof ProviderApiError) {
    const status = error.code === "paid_usage_not_allowed" ? 400 : error.status;
    res.status(status).json({ error: error.message });
    return;
  }
  res.status(502).json({ error: "The AI provider is temporarily unavailable." });
}

function serializeSettings(settings: Awaited<ReturnType<typeof getOrCreateAgentSettings>>) {
  return {
    primaryProvider: settings.primaryProvider,
    primaryModel: settings.primaryModel,
    fallbackProvider: settings.fallbackProvider,
    fallbackModel: settings.fallbackModel,
    allowPaidModels: settings.allowPaidModels,
    allowPaidFallback: settings.allowPaidFallback,
  };
}

async function validateModelSelection(
  provider: AiProvider,
  modelId: string | null,
  paidAllowed: boolean,
): Promise<void> {
  if (!modelId) return;
  const model = await getProviderModel(provider, modelId);
  if (model.priceStatus !== "free" && !paidAllowed) {
    throw new ProviderApiError("paid_usage_not_allowed", 400, false);
  }
}

router.get(
  "/ai/models",
  requireOwner,
  requireChangedPassword,
  async (req, res): Promise<void> => {
    try {
      const query = ListAiModelsQueryParams.parse(req.query);
      const provider = query.provider as AiProvider;
      try {
        const models = await listProviderModels(provider);
        res.json(
          ListAiModelsResponse.parse({
            provider,
            configured: true,
            models,
            error: null,
          }),
        );
      } catch (error) {
        res.json(
          ListAiModelsResponse.parse({
            provider,
            configured: hasProviderKey(provider),
            models: [],
            error:
              error instanceof ProviderApiError
                ? error.message
                : "The provider model catalog is unavailable.",
          }),
        );
      }
    } catch (error) {
      if (error instanceof Error && error.name === "ZodError") {
        res.status(400).json({ error: "Select a supported AI provider." });
      } else {
        res.status(502).json({ error: "The provider model catalog is unavailable." });
      }
    }
  },
);

router.get(
  "/ai/settings",
  requireOwner,
  requireChangedPassword,
  async (_req, res): Promise<void> => {
    try {
      const settings = await getOrCreateAgentSettings();
      res.json(GetAiSettingsResponse.parse(serializeSettings(settings)));
    } catch {
      res.status(500).json({ error: "AI settings are temporarily unavailable." });
    }
  },
);

router.put(
  "/ai/settings",
  requireOwner,
  requireChangedPassword,
  async (req, res): Promise<void> => {
    try {
      const input = UpdateAiSettingsBody.parse(req.body);
      if (input.allowPaidFallback && !input.allowPaidModels) {
        res.status(400).json({
          error: "Enable paid model usage before allowing a paid fallback.",
        });
        return;
      }
      if (
        input.primaryModel &&
        input.fallbackModel &&
        input.primaryProvider === input.fallbackProvider &&
        input.primaryModel === input.fallbackModel
      ) {
        res.status(400).json({
          error: "Choose a different model for automatic fallback.",
        });
        return;
      }

      await validateModelSelection(
        input.primaryProvider as AiProvider,
        input.primaryModel,
        input.allowPaidModels,
      );
      await validateModelSelection(
        input.fallbackProvider as AiProvider,
        input.fallbackModel,
        input.allowPaidFallback,
      );

      await db
        .insert(agentSettingsTable)
        .values({
          id: 1,
          primaryProvider: input.primaryProvider,
          primaryModel: input.primaryModel,
          fallbackProvider: input.fallbackProvider,
          fallbackModel: input.fallbackModel,
          allowPaidModels: input.allowPaidModels,
          allowPaidFallback: input.allowPaidFallback,
        })
        .onConflictDoUpdate({
          target: agentSettingsTable.id,
          set: {
            primaryProvider: input.primaryProvider,
            primaryModel: input.primaryModel,
            fallbackProvider: input.fallbackProvider,
            fallbackModel: input.fallbackModel,
            allowPaidModels: input.allowPaidModels,
            allowPaidFallback: input.allowPaidFallback,
            updatedAt: new Date(),
          },
        });

      const settings = await getOrCreateAgentSettings();
      res.json(UpdateAiSettingsResponse.parse(serializeSettings(settings)));
    } catch (error) {
      if (error instanceof Error && error.name === "ZodError") {
        res.status(400).json({ error: "AI settings are invalid." });
      } else {
        sendProviderError(res, error);
      }
    }
  },
);

export default router;
