const BACKEND_URL =
  "https://knowmore-backend.jollybay-f5e1622e.centralindia.azurecontainerapps.io";

async function handler(request: Request) {
  const url = new URL(request.url);
  const targetURL = `${BACKEND_URL}${url.pathname}${url.search}`;

  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.set("x-forwarded-host", url.host);

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

  return new Response(response.status === 204 ? null : response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}

export const GET = handler;
export const POST = handler;
