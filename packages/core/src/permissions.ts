export function canRemoveMissionFromTimeline(input: {
  currentUserId: string;
  recipientId: string;
  memoryCreatedBy?: string | null;
}): boolean {
  return input.currentUserId === input.recipientId
    || Boolean(input.memoryCreatedBy && input.currentUserId === input.memoryCreatedBy);
}

export function canEditMemory(input: {
  currentUserId: string;
  memoryCreatedBy?: string | null;
}): boolean {
  return Boolean(input.memoryCreatedBy && input.currentUserId === input.memoryCreatedBy);
}
