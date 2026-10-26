import "dotenv/config";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db/db.js";
import * as schema from "./db/schema.js";

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3001",
  secret: process.env.BETTER_AUTH_SECRET!,
  trustedOrigins: [process.env.FRONTEND_URL ?? "http://localhost:3000"],
  trustHost: true,
  baseRedirectURI: process.env.FRONTEND_URL,
  advanced: {
    crossSubDomainCookies: process.env.COOKIE_DOMAIN
      ? { enabled: true, domain: process.env.COOKIE_DOMAIN }
      : { enabled: false },
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
