import { eq } from "drizzle-orm";
import { getDb } from "@is2u/db/client";
import { coupleSettings } from "@is2u/db/schema";
import { coupleMissionIntervalSchema } from "@is2u/core/validation";
import { requireCsrf, requireSession } from "../../../../lib/auth";
import { json, readJson, withApiErrors } from "../../../../lib/http";

async function getSettings() {
  const [settings] = await getDb().select().from(coupleSettings).where(eq(coupleSettings.id, 1)).limit(1);
  return settings ?? (await getDb().insert(coupleSettings).values({ id: 1 }).returning())[0];
}

export const GET = withApiErrors(async (request: Request) => {
  await requireSession(request);
  const settings = await getSettings();
  return json({ minMinutes: settings.missionIntervalMinMinutes, maxMinutes: settings.missionIntervalMaxMinutes });
});

export const PUT = withApiErrors(async (request: Request) => {
  const session = await requireSession(request);
  await requireCsrf(request, session);
  const input = coupleMissionIntervalSchema.parse(await readJson(request));
  await getSettings();
  const [settings] = await getDb().update(coupleSettings).set({
    missionIntervalMinMinutes: input.minMinutes,
    missionIntervalMaxMinutes: input.maxMinutes,
    updatedAt: new Date(),
  }).where(eq(coupleSettings.id, 1)).returning();
  return json({ minMinutes: settings.missionIntervalMinMinutes, maxMinutes: settings.missionIntervalMaxMinutes });
});
