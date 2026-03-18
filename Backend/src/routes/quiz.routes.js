import { Router } from "express";
import {
  createQuiz,
  getQuizByVideo,
  submitQuiz,
  isquiz
} from "../controllers/quiz.controllers.js";
import { verifyJWT } from "../middlewares/auth.middlewares.js";

const router = Router();

router.post("/create/:videoId", verifyJWT, createQuiz); // Only for instructors
router.get("/isquiz/:videoId", verifyJWT, isquiz);
router.post("/:videoId/submit", verifyJWT, submitQuiz);
router.get("/:videoId", verifyJWT, getQuizByVideo);

export default router;
