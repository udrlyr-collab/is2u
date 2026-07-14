interface Env {
  MEDIA: R2Bucket;
  MEDIA_TOKEN_SECRET: string;
  APP_ORIGIN: string;
}

type TokenPayload = {
  assetId: string;
  userId: string;
  role: "preview" | "thumbnail" | "poster";
  key: string;
  mimeType: string;
  exp: number;
};

function decodeBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function verifyToken(token: string, secret: string): Promise<TokenPayload | null> {
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify("HMAC", key, decodeBase64Url(signature).buffer as ArrayBuffer, new TextEncoder().encode(body));
  if (!valid) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(decodeBase64Url(body))) as TokenPayload;
    if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
    if (!payload.assetId || !payload.userId || !payload.key || !["preview", "thumbnail", "poster"].includes(payload.role)) return null;
    if (!payload.key.startsWith(`${payload.role === "thumbnail" ? "thumbnails" : payload.role === "poster" ? "posters" : "previews"}/`)) return null;
    return payload;
  } catch {
    return null;
  }
}

function responseHeaders(env: Env, contentType: string, etag?: string): Headers {
  const headers = new Headers({
    "Content-Type": contentType,
    "Cache-Control": "public, max-age=31536000, immutable",
    "Access-Control-Allow-Origin": env.APP_ORIGIN,
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Expose-Headers": "Content-Length, Content-Range, ETag, Accept-Ranges",
    "Accept-Ranges": "bytes",
    "X-Content-Type-Options": "nosniff",
  });
  if (etag) headers.set("ETag", etag);
  return headers;
}

function unauthorized(env: Env): Response {
  return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store", "Access-Control-Allow-Origin": env.APP_ORIGIN } });
}

export default {
  async fetch(request: Request, env: Env, context: ExecutionContext): Promise<Response> {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: responseHeaders(env, "text/plain") });
    if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405 });
    const url = new URL(request.url);
    const token = url.searchParams.get("token");
    const payload = token ? await verifyToken(token, env.MEDIA_TOKEN_SECRET) : null;
    if (!payload) return unauthorized(env);
    if (url.pathname !== `/v1/${payload.assetId}`) return unauthorized(env);

    const rangeHeader = request.headers.get("range");
    if (rangeHeader) {
      const head = await env.MEDIA.head(payload.key);
      if (!head) return unauthorized(env);
      const match = /^bytes=(\d+)-(\d*)$/.exec(rangeHeader);
      if (!match) return new Response(null, { status: 416 });
      const start = Number(match[1]);
      const end = match[2] ? Math.min(Number(match[2]), head.size - 1) : head.size - 1;
      if (start > end || start >= head.size) return new Response(null, { status: 416 });
      const object = await env.MEDIA.get(payload.key, { range: { offset: start, length: end - start + 1 } });
      if (!object) return unauthorized(env);
      const headers = responseHeaders(env, payload.mimeType, object.httpEtag);
      headers.set("Content-Range", `bytes ${start}-${end}/${head.size}`);
      headers.set("Content-Length", String(end - start + 1));
      return new Response(request.method === "HEAD" ? null : object.body, { status: 206, headers });
    }

    const cacheUrl = new URL(request.url);
    cacheUrl.search = "";
    const cacheKey = new Request(cacheUrl.toString(), { method: "GET" });
    if (request.method === "GET") {
      const edgeCache = (caches as unknown as { default: Cache }).default;
      const cached = await edgeCache.match(cacheKey);
      if (cached) return cached;
    }
    const object = await env.MEDIA.get(payload.key);
    if (!object) return unauthorized(env);
    const headers = responseHeaders(env, payload.mimeType, object.httpEtag);
    headers.set("Content-Length", String(object.size));
    const response = new Response(request.method === "HEAD" ? null : object.body, { headers });
    if (request.method === "GET") context.waitUntil((caches as unknown as { default: Cache }).default.put(cacheKey, response.clone()));
    return response;
  },
} satisfies ExportedHandler<Env>;
