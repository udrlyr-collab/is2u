export function readBrowserCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const found = document.cookie.split(";").map((value) => value.trim()).find((value) => value.startsWith(`${name}=`));
  return found ? decodeURIComponent(found.slice(name.length + 1)) : null;
}

export async function apiFetch<T>(url: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const csrf = readBrowserCookie("is2u_csrf");
    if (csrf) headers.set("x-csrf-token", csrf);
  }
  const response = await fetch(url, { ...init, headers, credentials: "same-origin", cache: "no-store" });
  const payload = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "요청을 완료하지 못했습니다.");
  return payload as T;
}

