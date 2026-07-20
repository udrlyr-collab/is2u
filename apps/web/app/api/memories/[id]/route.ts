import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@is2u/db/client";
import { auditEvents, dateEvents, mediaAssets, memories, users } from "@is2u/db/schema";
import { memoryDisplayTitle, relationshipLabel } from "@is2u/core/types";
import { memoryEditSchema } from "@is2u/core/validation";
import { requireCsrf, requireSession } from "../../../../lib/auth";
import { HttpError, json, readJson, withApiErrors } from "../../../../lib/http";
import { canAccessMemory } from "../../../../lib/couples";

type Context = { params: Promise<{ id: string }> };

export const GET = withApiErrors(async (request: Request, context: Context) => {
  const session = await requireSession(request);
  const { id } = await context.params;
  const db = getDb();
  const [row] = await db.select({ memory: memories, author: users, dateEvent: dateEvents }).from(memories)
    .innerJoin(users, eq(memories.createdBy, users.id))
    .leftJoin(dateEvents, eq(memories.dateEventId, dateEvents.id))
    .where(and(eq(memories.id, id), isNull(memories.missionId), isNull(memories.deletedAt), eq(memories.pendingReplacement, false))).limit(1);
  if (!row) throw new HttpError(404, "추억을 찾을 수 없어요");
  if (!await canAccessMemory(session.user.id, row.memory)) throw new HttpError(404, "추억을 찾을 수 없어요");
  const assets = await db.select().from(mediaAssets).where(eq(mediaAssets.memoryId, id));
  return json({
    memory: { ...row.memory, displayTitle: memoryDisplayTitle({ type: row.memory.type, customTitle: row.memory.customTitle }), assets },
    author: { id: row.author.id, displayName: row.author.displayName, gender: row.author.gender, roleLabel: relationshipLabel(row.author.gender) },
    dateEvent: row.dateEvent,
    canEdit: row.memory.createdBy === session.user.id,
    canDelete: row.memory.createdBy === session.user.id,
  });
});

export const PUT = withApiErrors(async (request: Request, context: Context) => {
  const session = await requireSession(request);
  await requireCsrf(request, session);
  const { id } = await context.params;
  const input = memoryEditSchema.parse(await readJson(request));
  const db = getDb();
  const [current] = await db.select().from(memories).where(and(eq(memories.id, id), eq(memories.createdBy, session.user.id), isNull(memories.deletedAt))).limit(1);
  if (!current) throw new HttpError(404, "추억을 찾을 수 없어요");
  if (current.type === "text" && input.text !== undefined && !input.text) throw new HttpError(400, "남길 글을 입력해 주세요");
  if (input.dateEventId) {
    const [event] = await db.select({ id: dateEvents.id }).from(dateEvents).where(and(
      eq(dateEvents.id, input.dateEventId),
      ...(current.coupleId ? [eq(dateEvents.coupleId, current.coupleId)] : []),
      eq(dateEvents.isTest, false),
      isNull(dateEvents.deletedAt),
    )).limit(1);
    if (!event || !current.coupleId) throw new HttpError(404, "연결할 약속을 찾을 수 없어요");
  }
  const [memory] = await db.update(memories).set({
    customTitle: input.customTitle === undefined ? current.customTitle : input.customTitle,
    text: input.text === undefined ? current.text : input.text || null,
    dateEventId: input.dateEventId === undefined ? current.dateEventId : input.dateEventId,
    updatedAt: new Date(),
  }).where(eq(memories.id, id)).returning();
  await db.insert(auditEvents).values({ actorId: session.user.id, action: "memory.edited", entityType: "memory", entityId: id });
  return json({ memory });
});

export const DELETE = withApiErrors(async (request: Request, context: Context) => {
  const session = await requireSession(request);
  await requireCsrf(request, session);
  const { id } = await context.params;
  const now = new Date();
  const [memory] = await getDb().update(memories).set({ deletedAt: now, purgeAfter: new Date(now.getTime() + 30 * 24 * 60 * 60_000) }).where(and(eq(memories.id, id), eq(memories.createdBy, session.user.id), isNull(memories.deletedAt))).returning();
  if (!memory) throw new HttpError(404, "추억을 찾을 수 없어요");
  await getDb().insert(auditEvents).values({ actorId: session.user.id, action: "memory.soft_deleted", entityType: "memory", entityId: id });
  return json({ memory });
});

export const PATCH = withApiErrors(async (request: Request, context: Context) => {
  const session = await requireSession(request);
  await requireCsrf(request, session);
  const { id } = await context.params;
  const [memory] = await getDb().update(memories).set({ deletedAt: null, purgeAfter: null }).where(and(eq(memories.id, id), eq(memories.createdBy, session.user.id))).returning();
  if (!memory) throw new HttpError(404, "추억을 찾을 수 없어요");
  await getDb().insert(auditEvents).values({ actorId: session.user.id, action: "memory.restored", entityType: "memory", entityId: id });
  return json({ memory });
});
