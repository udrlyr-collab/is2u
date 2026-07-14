import { getDb, closeDb } from "./client";
import { coupleSettings, userSettings, users } from "./schema";
import { FIXED_USERS } from "@is2u/core/types";

const db = getDb();
const fixedUsers = Object.values(FIXED_USERS);
await db.insert(users).values(fixedUsers).onConflictDoUpdate({
  target: users.id,
  set: { displayName: users.displayName, roleLabel: users.roleLabel },
});
await db.insert(userSettings).values(fixedUsers.map((user) => ({ userId: user.id }))).onConflictDoNothing();
await db.insert(coupleSettings).values({ id: 1 }).onConflictDoNothing();
await closeDb();

