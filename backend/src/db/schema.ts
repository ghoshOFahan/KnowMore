import { pgTable as table, primaryKey, index } from "drizzle-orm/pg-core";
import * as t from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const users = table("users", {
  id: t.text("id").primaryKey(),
  name: t.text("name").notNull(),
  email: t.text("email").notNull().unique(),
  emailVerified: t.boolean("email_verified").default(false).notNull(),
  image: t.text("image"),
  createdAt: t.timestamp("created_at").defaultNow().notNull(),
  updatedAt: t
    .timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});
export const accounts = table(
  "accounts",
  {
    id: t.text("id").primaryKey(),
    accountId: t.text("account_id").notNull(),
    providerId: t.text("provider_id").notNull(),
    userId: t
      .text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: t.text("access_token"),
    refreshToken: t.text("refresh_token"),
    idToken: t.text("id_token"),
    accessTokenExpiresAt: t.timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: t.timestamp("refresh_token_expires_at"),
    scope: t.text("scope"),
    password: t.text("password"),
    createdAt: t.timestamp("created_at").defaultNow().notNull(),
    updatedAt: t
      .timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("accounts_userId_idx").on(table.userId)],
);
export const sessions = table(
  "sessions",
  {
    id: t.text("id").primaryKey(),
    expiresAt: t.timestamp("expires_at").notNull(),
    token: t.text("token").notNull().unique(),
    createdAt: t.timestamp("created_at").defaultNow().notNull(),
    updatedAt: t
      .timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    ipAddress: t.text("ip_address"),
    userAgent: t.text("user_agent"),
    userId: t
      .text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [index("sessions_userId_idx").on(table.userId)],
);
export const verifications = table(
  "verifications",
  {
    id: t.text("id").primaryKey(),
    identifier: t.text("identifier").notNull(),
    value: t.text("value").notNull(),
    expiresAt: t.timestamp("expires_at").notNull(),
    createdAt: t.timestamp("created_at").defaultNow().notNull(),
    updatedAt: t
      .timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("verifications_identifier_idx").on(table.identifier)],
);
export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  accounts: many(accounts),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  users: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  users: one(users, {
    fields: [accounts.userId],
    references: [users.id],
  }),
}));

export const topics = table("topics", {
  id: t.integer().primaryKey().generatedAlwaysAsIdentity(),
  name: t.varchar({ length: 256 }).notNull().unique(),
  embeddingVector: t.vector("embedding_vector", { dimensions: 768 }).notNull(),
  createdAt: t.timestamp("created_at").defaultNow().notNull(),
});
export const topicAnchors = table(
  "topic_anchors",
  {
    userId: t
      .text("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    topicId: t
      .integer("topic_id")
      .references(() => topics.id, { onDelete: "cascade" })
      .notNull(),
    currentScore: t.real("current_score"),
  },
  (table) => [primaryKey({ columns: [table.userId, table.topicId] })],
);
export const games = table("games", {
  id: t.integer().primaryKey().generatedAlwaysAsIdentity(),
  roomId: t.varchar("room_id", { length: 10 }).notNull(),
  winnerId: t.text("winner_id").references(() => users.id),
  wordChain: t.text("word_chain").array().notNull().default([]),
  playedAt: t.timestamp("played_at").defaultNow().notNull(),
});
export const gamePlayers = table(
  "game_players",
  {
    gameId: t
      .integer("game_id")
      .references(() => games.id, { onDelete: "cascade" })
      .notNull(),
    userId: t
      .text("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    isEliminated: t.boolean("is_eliminated").default(false),
    wordsContributed: t.integer("words_contributed").default(0),
    rank: t.integer("rank"),
  },
  (table) => [primaryKey({ columns: [table.gameId, table.userId] })],
);
