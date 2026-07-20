import { getDb, closeDb } from "./client";
import { coupleMembers, couples, coupleSettings, userSettings, users } from "./schema";
import { FIXED_USERS } from "@is2u/core/types";

const db = getDb();
const fixedUsers = Object.values(FIXED_USERS);
await db.insert(users).values(fixedUsers).onConflictDoUpdate({
  target: users.id,
  set: { displayName: users.displayName, roleLabel: users.roleLabel, gender: users.gender },
});
await db.insert(userSettings).values(fixedUsers.map((user) => ({ userId: user.id }))).onConflictDoNothing();
const legacyCoupleId = "7f88cb2e-6f6d-4bfd-a0a5-7d55c31f3cd1";
await db.insert(couples).values({ id: legacyCoupleId, status: "active" }).onConflictDoNothing();
await db.insert(coupleMembers).values(fixedUsers.map((user) => ({ coupleId: legacyCoupleId, userId: user.id }))).onConflictDoNothing();
await db.insert(coupleSettings).values({ id: 1, coupleId: legacyCoupleId }).onConflictDoNothing();
await closeDb();
