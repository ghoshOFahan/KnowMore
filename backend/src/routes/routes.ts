import { Router } from "express";
import { insertData } from "../controllers/onboarding_controller.js";
import { getProfileRadar } from "../controllers/profile_controller.js";
import { requireAuth } from "../middleware/authenticate.js";
import { db } from "../db/db.js";
import { eq } from "drizzle-orm";
import { topicAnchors } from "../db/schema.js";
import { judgeWords } from "../ai/judge.js";
import { getFunnyComment } from "../ai/aiCommentator.js";
const router = Router();

// Endpoint for Next.js to hit right after Google Auth -> Onboarding
router.post("/onboarding", requireAuth, insertData);

// Endpoint for the Dashboard to fetch the data formatted for Recharts
router.get("/profile/radar", requireAuth, getProfileRadar);

router.get("/onboarding/status", requireAuth, async (req, res) => {
  const userId = req.user?.id;
  const existing = await db
    .select()
    .from(topicAnchors)
    .where(eq(topicAnchors.userId, userId))
    .limit(1);

  res.json({ hasOnboarded: existing.length > 0 });
});
router.post("/game/judge", requireAuth, async (req, res) => {
  const { lastWord, newWord } = req.body;
  const result = await judgeWords(lastWord, newWord);
  res.json(result); // { isValid, score }
});

router.post("/game/comment", requireAuth, async (req, res) => {
  const { gameSummary } = req.body;
  const comment = await getFunnyComment(gameSummary);
  res.json({ comment });
});
export default router;
