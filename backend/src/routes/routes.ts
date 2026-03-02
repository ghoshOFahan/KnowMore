import { Router } from "express";
import { insertData } from "../controllers/onboarding_controller.js";
import { getProfileRadar } from "../controllers/profile_controller.js";
import { requireAuth } from "../middleware/authenticate.js";

const router = Router();

// Endpoint for Next.js to hit right after Google Auth -> Onboarding
router.post("/onboarding", requireAuth, insertData);

// Endpoint for the Dashboard to fetch the data formatted for Recharts
router.get("/profile/radar", requireAuth, getProfileRadar);

export default router;
