export type AiProvider = "openrouter";
export type PriceStatus = "free" | "paid" | "unknown";
export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage { role: ChatRole; content: string }
export interface AiModel {
  id: string; name: string; provider: AiProvider; priceStatus: PriceStatus;
  promptPricePerToken: number | null; completionPricePerToken: number | null; contextLength: number | null;
}
export interface AiCompletion {
  content: string; promptTokens: number; completionTokens: number;
  estimatedCostUsd: number | null; provider: AiProvider; model: string; fallbackUsed: boolean;
}
export interface ProviderSettings {
  primaryProvider: AiProvider; primaryModel: string | null;
  fallbackProvider: AiProvider; fallbackModel: string | null;
  allowPaidModels: boolean; allowPaidFallback: boolean;
}

export class ProviderApiError extends Error {
  constructor(readonly code: string, readonly status: number, readonly retryable: boolean) {
    super(messageFor(code)); this.name = "ProviderApiError";
  }
}
function messageFor(code: string): string {
  if (code === "provider_not_configured") return "The OpenRouter API key is not configured.";
  if (code === "credentials_rejected") return "OpenRouter rejected the API key.";
  if (code === "provider_access_denied") return "OpenRouter denied access to this request.";
  if (code === "rate_limited") return "The provider rate limit was reached. Try again later.";
  if (code === "quota_exceeded") return "The provider account quota is exhausted.";
  if (code === "model_unavailable") return "The selected model is unavailable.";
  if (code === "paid_usage_not_allowed") return "Paid model usage is not enabled.";
  return "The AI provider is temporarily unavailable.";
}
const cache = new Map<string, { expires: number; models: AiModel[] }>();
function key(): string | undefined { const value = process.env.OPENROUTER_API_KEY?.trim(); return value?.replace(/^Bearer\s+/i, ""); }
export function hasProviderKey(provider: AiProvider): boolean { return provider === "openrouter" && Boolean(key()); }
function requireKey(): string { const value = key(); if (!value) throw new ProviderApiError("provider_not_configured", 503, false); return value; }
function price(value: unknown): number | null { const n = Number(value); return Number.isFinite(n) && n >= 0 ? n : null; }
async function request(url: string, init: RequestInit): Promise<any> {
  let response: Response;
  try { response = await fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(20_000) }); }
  catch { throw new ProviderApiError("provider_unavailable", 503, true); }
  let body: any = null; try { body = await response.json(); } catch {}
  if (!response.ok) {
    const code = response.status === 401 ? "credentials_rejected" : response.status === 403 ? "provider_access_denied" : response.status === 429 ? "rate_limited" : response.status === 402 ? "quota_exceeded" : "provider_unavailable";
    throw new ProviderApiError(code, response.status, response.status >= 500 || response.status === 429);
  }
  return body;
}
export async function listProviderModels(provider: AiProvider): Promise<AiModel[]> {
  if (provider !== "openrouter") throw new ProviderApiError("provider_unavailable", 400, false);
  const cached = cache.get(provider); if (cached && cached.expires > Date.now()) return cached.models;
  const body = await request("https://openrouter.ai/api/v1/models", { headers: { Authorization: `Bearer ${requireKey()}`, Accept: "application/json", "X-Title": "AgentMilton" } });
  const models = (Array.isArray(body?.data) ? body.data : []).filter((item: any) => typeof item.id === "string").slice(0, 500).map((item: any) => {
    const input = price(item.pricing?.prompt), output = price(item.pricing?.completion);
    return { id: item.id, name: typeof item.name === "string" ? item.name : item.id, provider, priceStatus: input === null || output === null ? "unknown" : input === 0 && output === 0 ? "free" : "paid", promptPricePerToken: input, completionPricePerToken: output, contextLength: typeof item.context_length === "number" ? item.context_length : null };
  });
  cache.set(provider, { expires: Date.now() + 60_000, models }); return models;
}
export async function getProviderModel(provider: AiProvider, modelId: string): Promise<AiModel> {
  const model = (await listProviderModels(provider)).find((item) => item.id === modelId);
  if (!model) throw new ProviderApiError("model_unavailable", 400, false); return model;
}
export async function createAgentCompletion(settings: ProviderSettings, messages: ChatMessage[], fallbackUsed = false): Promise<AiCompletion> {
  const provider = fallbackUsed ? settings.fallbackProvider : settings.primaryProvider;
  const modelId = fallbackUsed ? settings.fallbackModel : settings.primaryModel;
  if (!modelId) throw new ProviderApiError("model_unavailable", 400, false);
  const model = await getProviderModel(provider, modelId);
  if (model.priceStatus !== "free" && !(fallbackUsed ? settings.allowPaidFallback : settings.allowPaidModels)) throw new ProviderApiError("paid_usage_not_allowed", 402, false);
  const body = await request("https://openrouter.ai/api/v1/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${requireKey()}`, "Content-Type": "application/json", "X-Title": "AgentMilton" }, body: JSON.stringify({ model: model.id, messages }) });
  const content = body?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new ProviderApiError("invalid_response", 502, false);
  const usage = body.usage ?? {};
  return { content, promptTokens: Number(usage.prompt_tokens ?? 0), completionTokens: Number(usage.completion_tokens ?? 0), estimatedCostUsd: null, provider, model: model.id, fallbackUsed };
}
export async function completeWithFallback(settings: ProviderSettings, messages: ChatMessage[]): Promise<AiCompletion> {
  try { return await createAgentCompletion(settings, messages, false); }
  catch (error) { if (!settings.fallbackModel || !settings.allowPaidFallback) throw error; return createAgentCompletion(settings, messages, true); }
}
export async function completeAgent(settings: ProviderSettings, messages: ChatMessage[]): Promise<AiCompletion> { return completeWithFallback(settings, messages); }
export async function generateCompletion(settings: ProviderSettings, messages: ChatMessage[]): Promise<AiCompletion> { return completeWithFallback(settings, messages); }
export async function chatCompletion(settings: ProviderSettings, messages: ChatMessage[]): Promise<AiCompletion> { return completeWithFallback(settings, messages); }
export async function createCompletion(settings: ProviderSettings, messages: ChatMessage[]): Promise<AiCompletion> { return completeWithFallback(settings, messages); }
