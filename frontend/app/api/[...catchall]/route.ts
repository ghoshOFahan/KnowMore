const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:3001";

async function handler(request: Request) {
  const url = new URL(request.url);
  const targetURL = `${BACKEND_URL}${url.pathname}${url.search}`;

  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.set("x-forwarded-host", url.host);
  headers.set("x-forwarded-proto", "https"); // Tell Better-Auth we are secure

  let body: string | undefined;
  if (request.method !== "GET" && request.method !== "HEAD") {
    try {
      body = await request.text();
    } catch {
      body = undefined;
    }
  }

  const response = await fetch(targetURL, {
    method: request.method,
    headers,
    body,
    redirect: "manual",
  });

  const responseHeaders = new Headers(response.headers);

  // FIX : Strip encoding/length headers to prevent Vercel 500s.
  // Next.js will automatically recalculate these for the client.
  responseHeaders.delete("content-encoding");
  responseHeaders.delete("content-length");
  responseHeaders.delete("transfer-encoding");

  // Preserve shared-domain cookies; remove a host-only backend Domain if present.
  const setCookies = responseHeaders.getSetCookie();
  if (setCookies && setCookies.length > 0) {
    responseHeaders.delete("set-cookie");
    for (const cookie of setCookies) {
      const rewrittenCookie = cookie.replace(/Domain=[^;]+;?\s*/gi, (domain) =>
        domain.toLowerCase().includes(new URL(BACKEND_URL).hostname.toLowerCase())
          ? ""
          : domain,
      );
      responseHeaders.append("set-cookie", rewrittenCookie);
    }
  }

  return new Response(response.status === 204 ? null : response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}

export const GET = handler;
export const POST = handler;
