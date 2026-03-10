import "dotenv/config";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db/db.js";
import * as schema from "./db/schema.js";

export const auth = betterAuth({
  baseURL: "https://knowmore.ahanghosh.site/api/auth",
  secret: process.env.BETTER_AUTH_SECRET!,
  trustedOrigins: ["https://knowmore.ahanghosh.site"],
  trustHost: true,
  baseRedirectURI: process.env.FRONTEND_URL,
  advanced: {
    crossSubdomainCookies: {
      enabled: false,
    },
    defaultCookieAttributes: {
      sameSite: "none",
      secure: true,
      partitioned: true,
    },
  },
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
    usePlural: true,
  }),
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
  },
});
