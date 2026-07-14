import { getServerEnv } from "@is2u/core/env";
import { requireSession } from "../../../../lib/auth";
import { json, withApiErrors } from "../../../../lib/http";

export const GET = withApiErrors(async (request: Request) => {
  await requireSession(request);
  return json({ publicKey: getServerEnv().VAPID_PUBLIC_KEY });
});

