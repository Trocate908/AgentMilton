import { eq } from "drizzle-orm";
import { agentSettingsTable, db } from "@workspace/db";

export async function getOrCreateAgentSettings() {
  await db.insert(agentSettingsTable).values({ id: 1 }).onConflictDoNothing();
  const [settings] = await db
    .select()
    .from(agentSettingsTable)
    .where(eq(agentSettingsTable.id, 1))
    .limit(1);
  if (!settings) throw new Error("AI settings could not be initialized.");

  const normalized = {
    primaryProvider: "openrouter",
    primaryModel: settings.primaryProvider === "openrouter" ? settings.primaryModel : null,
    fallbackProvider: "openrouter",
    fallbackModel: settings.fallbackProvider === "openrouter" ? settings.fallbackModel : null,
  };
  if (
    settings.primaryProvider !== normalized.primaryProvider ||
    settings.primaryModel !== normalized.primaryModel ||
    settings.fallbackProvider !== normalized.fallbackProvider ||
    settings.fallbackModel !== normalized.fallbackModel
  ) {
    await db
      .update(agentSettingsTable)
      .set({ ...normalized, updatedAt: new Date() })
      .where(eq(agentSettingsTable.id, 1));
    return { ...settings, ...normalized };
  }
  return settings;
}
