export function normalizeAppVersion(value: string | null | undefined): string | null {
  const normalized = value?.trim().replace(/^v+/i, "").trim();
  return normalized || null;
}

export function appVersionLabel(value: string | null | undefined): string | null {
  const normalized = normalizeAppVersion(value);
  return normalized ? `v${normalized}` : null;
}
