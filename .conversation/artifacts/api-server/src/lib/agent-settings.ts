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
  return settings;
}
