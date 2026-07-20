import { sql } from "drizzle-orm";
import { FIXED_USERS } from "@is2u/core/types";
import { closeDb, getDb } from "@is2u/db/client";

type Metric = { metric: string; value: number };
const db = getDb();
const fixedIds = [FIXED_USERS.seongmin.id, FIXED_USERS.seoyeong.id];

const [column] = await db.execute<{ exists: boolean }>(sql`
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'users' and column_name = 'username'
  ) as exists
`);

const metrics = await db.execute<Metric>(sql`
  select 'users' as metric, count(*)::int as value from users
  union all select 'legacy_users_present', count(*)::int from users where id::text in (${fixedIds[0]}, ${fixedIds[1]})
  union all select 'unexpected_pre_migration_users', count(*)::int from users where id::text not in (${fixedIds[0]}, ${fixedIds[1]})
  union all select 'date_events', count(*)::int from date_events
  union all select 'missions', count(*)::int from missions
  union all select 'memories', count(*)::int from memories
  union all select 'media_assets', count(*)::int from media_assets
  union all select 'push_subscriptions', count(*)::int from push_subscriptions
  union all select 'orphan_date_creators', count(*)::int from date_events d left join users u on u.id = d.created_by where u.id is null
  union all select 'orphan_mission_recipients', count(*)::int from missions m left join users u on u.id = m.recipient_id where u.id is null
  union all select 'orphan_memory_creators', count(*)::int from memories m left join users u on u.id = m.created_by where u.id is null
  union all select 'orphan_memory_missions', count(*)::int from memories m left join missions x on x.id = m.mission_id where m.mission_id is not null and x.id is null
  union all select 'orphan_media_memories', count(*)::int from media_assets a left join memories m on m.id = a.memory_id where m.id is null
`);

const values = Object.fromEntries(metrics.map((row) => [row.metric, Number(row.value)]));
const preMigration = !column?.exists;
const blockers: string[] = [];
if (values.legacy_users_present !== 2) blockers.push("기존 사용자 UUID 두 개가 모두 존재하지 않아요");
for (const key of ["orphan_date_creators", "orphan_mission_recipients", "orphan_memory_creators", "orphan_memory_missions", "orphan_media_memories"]) {
  if (values[key] !== 0) blockers.push(`${key}=${values[key]}`);
}
if (preMigration && values.unexpected_pre_migration_users !== 0) blockers.push(`예상하지 못한 기존 사용자 ${values.unexpected_pre_migration_users}명이 있어요`);

console.log(JSON.stringify({
  accountMigrationApplied: !preMigration,
  ownershipAmbiguities: blockers,
  metrics: values,
}, null, 2));
await closeDb();
if (blockers.length) process.exitCode = 1;
