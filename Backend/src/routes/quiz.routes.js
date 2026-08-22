import { Router } from "express";
import {
  createQuizAI,
  createQuiz,
  getQuizByVideo,
  submitQuiz,
  isquiz
} from "../controllers/quiz.controllers.js";
import { verifyJWT } from "../middlewares/auth.middlewares.js";
import { checkRole } from "../middlewares/role.middlewares.js";

const router = Router();

router.post("/create/:videoId", verifyJWT, checkRole("instructor"), createQuiz);
// Public: let anyone (e.g. recruiters) generate an AI quiz without logging in.
router.post("/create-ai/:videoId", createQuizAI);
router.get("/isquiz/:videoId", isquiz);
// Public: let anyone view and attempt a quiz without logging in.
router.post("/:videoId/submit", submitQuiz);
router.get("/:videoId", getQuizByVideo);

export default router;
