const BACKEND_URL =
  "https://knowmore-backend.jollybay-f5e1622e.centralindia.azurecontainerapps.io";

async function handler(request: Request) {
  const url = new URL(request.url);
  const targetURL = `${BACKEND_URL}${url.pathname}${url.search}`;

  const headers = new Headers(request.headers);
  headers.delete("host");

  const response = await fetch(targetURL, {
    method: request.method,
    headers,
    body:
      request.method !== "GET" && request.method !== "HEAD"
        ? request.body
        : undefined,
    redirect: "manual",
  });

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

export const GET = handler;
export const POST = handler;
