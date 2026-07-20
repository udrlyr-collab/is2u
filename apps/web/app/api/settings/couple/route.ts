import { eq } from "drizzle-orm";
import { getDb } from "@is2u/db/client";
import { coupleSettings } from "@is2u/db/schema";
import { coupleMissionIntervalSchema } from "@is2u/core/validation";
import { requireCsrf, requireSession } from "../../../../lib/auth";
import { json, readJson, withApiErrors } from "../../../../lib/http";
import { requireActiveCouple } from "../../../../lib/couples";
import { updateMissionIntervalAndReschedule } from "../../../../lib/scheduler";

async function getSettings(coupleId: string) {
  const [settings] = await getDb().select().from(coupleSettings).where(eq(coupleSettings.coupleId, coupleId)).limit(1);
  if (settings) return settings;
  const [created] = await getDb().insert(coupleSettings).values({ coupleId }).onConflictDoNothing({ target: coupleSettings.coupleId }).returning();
  if (created) return created;
  return (await getDb().select().from(coupleSettings).where(eq(coupleSettings.coupleId, coupleId)).limit(1))[0]!;
}

export const GET = withApiErrors(async (request: Request) => {
  const session = await requireSession(request);
  const active = await requireActiveCouple(session.user.id);
  const settings = await getSettings(active.id);
  return json({ minMinutes: settings.missionIntervalMinMinutes, maxMinutes: settings.missionIntervalMaxMinutes });
});

export const PUT = withApiErrors(async (request: Request) => {
  const session = await requireSession(request);
  await requireCsrf(request, session);
  const input = coupleMissionIntervalSchema.parse(await readJson(request));
  const active = await requireActiveCouple(session.user.id);
  const settings = await updateMissionIntervalAndReschedule(active.id, input.minMinutes, input.maxMinutes);
  return json(settings);
});
