export type AiProvider = "openrouter";
export type PriceStatus = "free" | "paid" | "unknown";
export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface AiModel {
  id: string;
  name: string;
  provider: AiProvider;
  priceStatus: PriceStatus;
  promptPricePerToken: number | null;
  completionPricePerToken: number | null;
  contextLength: number | null;
}

export interface AiCompletion {
  content: string;
  promptTokens: number;
  completionTokens: number;
  estimatedCostUsd: number | null;
  provider: AiProvider;
  model: string;
  fallbackUsed: boolean;
}

export interface ProviderSettings {
  primaryProvider: AiProvider;
  primaryModel: string | null;
  fallbackProvider: AiProvider;
  fallbackModel: string | null;
  allowPaidModels: boolean;
  allowPaidFallback: boolean;
}

export class ProviderApiError extends Error {
  constructor(
    readonly code:
      | "provider_not_configured"
      | "credentials_rejected"
      | "provider_access_denied"
      | "rate_limited"
      | "quota_exceeded"
      | "provider_unavailable"
      | "request_timeout"
      | "model_unavailable"
      | "paid_usage_not_allowed"
      | "invalid_response",
    readonly status: number,
    readonly retryable: boolean,
  ) {
    super(safeProviderErrorMessage(code));
    this.name = "ProviderApiError";
  }
}

const MODEL_CACHE_MS = 60_000;
const MAX_MODELS = 500;
const modelCache = new Map<string, { expiresAt: number; models: AiModel[] }>();

function safeProviderErrorMessage(code: ProviderApiError["code"]): string {
  switch (code) {
    case "provider_not_configured":
      return "The OpenRouter server-side API key is not configured.";
    case "credentials_rejected":
      return "OpenRouter rejected the API key. Replace OPENROUTER_API_KEY in Replit Secrets with a current key.";
    case "provider_access_denied":
      return "OpenRouter denied access to this request. Check that the key is active and the selected model is available to your account.";
    case "rate_limited":
      return "The provider rate limit was reached. Try again later.";
    case "quota_exceeded":
      return "The provider reported that its account quota is exhausted.";
    case "request_timeout":
      return "The provider request timed out.";
    case "model_unavailable":
      return "The selected model is no longer available from the provider.";
    case "paid_usage_not_allowed":
      return "This model may incur charges. Enable paid usage in settings before selecting it.";
    case "invalid_response":
      return "The provider returned a response the agent could not safely use.";
    default:
      return "The AI provider is temporarily unavailable.";
  }
}

function providerKey(): string | undefined {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  return key?.replace(/^Bearer\s+/i, "");
}

function providerReferer(): string {
  return (
    process.env.APP_URL?.trim() ||
    process.env.VERCEL_URL?.trim() && `https://${process.env.VERCEL_URL.trim()}` ||
    process.env.REPLIT_DOMAINS?.split(",")[0]?.trim() ||
    "https://agentmilton.vercel.app"
  );
}

function parsePrice(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function priceStatus(input: number | null, output: number | null): PriceStatus {
  if (input === null || output === null) return "unknown";
  return input === 0 && output === 0 ? "free" : "paid";
}

function responseError(
  status: number,
  body: unknown,
): ProviderApiError {
  const text = JSON.stringify(body ?? "").toLowerCase();
  if (status === 401) {
    return new ProviderApiError("credentials_rejected", status, false);
  }
  if (status === 403) {
    return new ProviderApiError("provider_access_denied", status, false);
  }
  if (status === 402 || text.includes("insufficient") || text.includes("quota exceeded")) {
    return new ProviderApiError("quota_exceeded", status, true);
  }
  if (status === 429) {
    return new ProviderApiError("rate_limited", status, true);
  }
  if ([408, 500, 502, 503, 504].includes(status)) {
    return new ProviderApiError("provider_unavailable", status, true);
  }
  return new ProviderApiError("provider_unavailable", status, false);
}

async function fetchJson(
  provider: AiProvider,
  url: string,
  init: RequestInit,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      redirect: "error",
      signal: init.signal ?? AbortSignal.timeout(20_000),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new ProviderApiError("request_timeout", 504, true);
    }
    throw new ProviderApiError("provider_unavailable", 503, true);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    throw responseError(response.status, payload);
  }
  return payload;
}

function requireKey(): string {
  const key = providerKey();
  if (!key) {
    throw new ProviderApiError("provider_not_configured", 503, false);
  }
  return key;
}

async function fetchOpenRouterModels(): Promise<AiModel[]> {
  const key = requireKey();
  const payload = (await fetchJson("openrouter", "https://openrouter.ai/api/v1/models", {
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      "HTTP-Referer": providerReferer(),
      "X-Title": "AgentMilton",
    },
  })) as { data?: Array<Record<string, unknown>> };

  if (!Array.isArray(payload.data)) {
    throw new ProviderApiError("invalid_response", 502, false);
  }

  return payload.data
    .filter((item) => typeof item.id === "string")
    .slice(0, MAX_MODELS)
    .map((item) => {
      const pricing = (item.pricing ?? {}) as Record<string, unknown>;
      const promptPricePerToken = parsePrice(pricing.prompt);
      const completionPricePerToken = parsePrice(pricing.completion);
      return {
        id: String(item.id),
        name: typeof item.name === "string" ? item.name : String(item.id),
        provider: "openrouter",
        priceStatus: priceStatus(promptPricePerToken, completionPricePerToken),
        promptPricePerToken,
        completionPricePerToken,
        contextLength:
          typeof item.context_length === "number" && Number.isFinite(item.context_length)
            ? item.context_length
            : null,
      };
    });
}

export async function listProviderModels(provider: AiProvider): Promise<AiModel[]> {
  const cached = modelCache.get(provider);
  if (cached && cached.expiresAt > Date.now()) return cached.models;

  const models = await fetchOpenRouterModels();
  modelCache.set(provider, { expiresAt: Date.now() + MODEL_CACHE_MS, models });
  return models;
}

export async function getProviderModel(
  provider: AiProvider,
  modelId: string,
): Promise<AiModel> {
  const models = await listProviderModels(provider);
  const model = models.find((candidate) => candidate.id === modelId);
  if (!model) throw new ProviderApiError("model_unavailable", 400, false);
  return model;
}

function assertPaidUsageAllowed(model: AiModel, allowPaidModels: boolean): void {
  if (model.priceStatus !== "free" && !allowPaidModels) {
    throw new ProviderApiError("paid_usage_not_allowed", 402, false);
  }
}

function estimateOpenRouterCost(
  promptTokens: number,
  completionTokens: number,
  model: AiModel,
): number | null {
  if (model.promptPricePerToken === null || model.completionPricePerToken === null) {
    return null;
  }
  return (
    promptTokens * model.promptPricePerToken +
    completionTokens * model.completionPricePerToken
  );
}

async function completeWithProvider(
  provider: AiProvider,
  model: AiModel,
  messages: ChatMessage[],
): Promise<Omit<AiCompletion, "fallbackUsed">> {
  const key = requireKey();
  const payload = (await fetchJson(
    provider,
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        "HTTP-Referer": providerReferer(),
        "X-Title": "AgentMilton",
      },
      body: JSON.stringify({
        model: model.id,
        messages,
        max_tokens: 8192,
        temperature: 0.15,
      }),
      signal: AbortSignal.timeout(60_000),
    },
  )) as {
    choices?: Array<{ message?: { content?: unknown } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
  };
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new ProviderApiError("invalid_response", 502, false);
  }
  const promptTokens = Number(payload.usage?.prompt_tokens ?? 0);
  const completionTokens = Number(payload.usage?.completion_tokens ?? 0);
  return {
    content,
    promptTokens,
    completionTokens,
    estimatedCostUsd:
      typeof payload.usage?.cost === "number"
        ? payload.usage.cost
        : estimateOpenRouterCost(promptTokens, completionTokens, model),
    provider,
    model: model.id,
  };
}

function isRecoverableFailure(error: unknown): error is ProviderApiError {
  return error instanceof ProviderApiError && error.retryable;
}

export async function createAgentCompletion(
  settings: ProviderSettings,
  messages: ChatMessage[],
): Promise<AiCompletion> {
  const primaryProvider = settings.primaryProvider as AiProvider;
  const primaryModelId = settings.primaryModel ||
    (await listProviderModels(primaryProvider)).find((model) => model.priceStatus === "free")?.id ||
    (await listProviderModels(primaryProvider))[0]?.id;
  if (!primaryModelId) {
    throw new ProviderApiError("model_unavailable", 400, false);
  }

  const primaryModel = await getProviderModel(primaryProvider, primaryModelId);
  assertPaidUsageAllowed(primaryModel, settings.allowPaidModels);

  try {
    return {
      ...(await completeWithProvider(primaryProvider, primaryModel, messages)),
      fallbackUsed: false,
    };
  } catch (error) {
    if (
      !isRecoverableFailure(error) ||
      !settings.fallbackModel ||
      settings.fallbackModel === settings.primaryModel
    ) {
      throw error;
    }

    const fallbackProvider = settings.fallbackProvider as AiProvider;
    const fallbackModel = await getProviderModel(
      fallbackProvider,
      settings.fallbackModel,
    );
    if (
      fallbackModel.priceStatus !== "free" &&
      (!settings.allowPaidFallback || !settings.allowPaidModels)
    ) {
      throw new ProviderApiError("paid_usage_not_allowed", 402, false);
    }
    return {
      ...(await completeWithProvider(fallbackProvider, fallbackModel, messages)),
      fallbackUsed: true,
    };
  }
}

export function hasProviderKey(provider: AiProvider): boolean {
  return provider === "openrouter" && Boolean(providerKey());
}
