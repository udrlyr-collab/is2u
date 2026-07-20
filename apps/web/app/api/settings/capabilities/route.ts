import { getDb } from "@is2u/db/client";
import { userSettings } from "@is2u/db/schema";
import { missionCapabilitiesSchema } from "@is2u/core/validation";
import { requireCsrf, requireSession } from "../../../../lib/auth";
import { json, readJson, withApiErrors } from "../../../../lib/http";

export const POST = withApiErrors(async (request: Request) => {
  const session = await requireSession(request);
  await requireCsrf(request, session);
  const input = missionCapabilitiesSchema.parse(await readJson(request));
  await getDb().insert(userSettings).values({
    userId: session.user.id,
    missionCapabilities: input.capabilities,
  }).onConflictDoUpdate({
    target: userSettings.userId,
    set: { missionCapabilities: input.capabilities, updatedAt: new Date() },
  });
  return json({ ok: true });
});
