import { test } from "node:test";
import assert from "node:assert/strict";
import { appealApproved, calculateDailyStreak, containsBlockedLanguage, directionalPull, moderatorAllowed, riskPoints, syncResult, verdictCacheKey } from "../src/gameRules.js";

test("moderation requires an exact configured user ID", () => {
  assert.equal(moderatorAllowed("user-a", "user-a, user-b"), true);
  assert.equal(moderatorAllowed("user", "user-a, user-b"), false);
  assert.equal(moderatorAllowed("user-a", ""), false);
});

test("basic language filter checks whole words without ignoring case", () => {
  assert.equal(containsBlockedLanguage("A Faggot!"), true);
  assert.equal(containsBlockedLanguage("a chicken"), false);
});

test("verdict cache identifies the same pair in either order and case", () => {
  assert.equal(verdictCacheKey("Star", "galaxy"), verdictCacheKey(" GALAXY ", "star"));
  assert.notEqual(verdictCacheKey("star", "galaxy"), verdictCacheKey("star", "bread"));
});

test("a move earns only positive movement toward an anchor", () => {
  assert.equal(directionalPull(0.8, 0.8), 0);
  assert.equal(directionalPull(0.5, 0.8), 0);
  assert.equal(directionalPull(0.81, 0.8), 0);
  assert.ok(Math.abs(directionalPull(0.8, 0.5) - 0.3) < 1e-10);
  assert.equal(directionalPull(NaN, 0.5), 0);
});

test("risk points reward weaker accepted links", () => {
  assert.equal(riskPoints(0.9), 1);
  assert.equal(riskPoints(0.4), 3);
  assert.equal(riskPoints(1), 1);
});

test("an appeal requires a majority of eligible voters", () => {
  assert.equal(appealApproved(["a", "b", "c"], { a: "yes", b: "yes" }), true);
  assert.equal(appealApproved(["a", "b", "c"], { a: "yes" }), false);
  assert.equal(appealApproved(["a", "b"], { a: "yes", b: "no", outsider: "yes" }), false);
});

test("sync scores identical words and the exact similarity boundary", () => {
  assert.deepEqual(syncResult("ocean", "ocean", 0), { result: "SYNCED", points: 3 });
  assert.deepEqual(syncResult("sea", "ocean", 0.8), { result: "CLOSE", points: 1 });
  assert.deepEqual(syncResult("sea", "ocean", 0.799), { result: "NONE", points: 0 });
});

test("daily streak survives through today after a game yesterday, and resets after a gap", () => {
  assert.deepEqual(calculateDailyStreak(["2026-11-03", "2026-11-04"], "2026-11-05"), { streak: 2, playedToday: false });
  assert.deepEqual(calculateDailyStreak(["2026-11-03"], "2026-11-05"), { streak: 0, playedToday: false });
  assert.deepEqual(calculateDailyStreak(["2026-11-04", "2026-11-05"], "2026-11-05"), { streak: 2, playedToday: true });
});
