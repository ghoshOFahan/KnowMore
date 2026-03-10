import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  //  baseURL: process.env.NEXT_PUBLIC_BACKEND_URL!, // /api/auth
  baseURL: "https://knowmore.ahanghosh.site",
});
