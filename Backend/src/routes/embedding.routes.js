import { Router } from "express";
import {
  answerQuestionFromTranscript,
  chunkAndEmbed,
} from "../controllers/embedding.controllers.js";
import { verifyJWT } from "../middlewares/auth.middlewares.js";

const router = Router();

router.post("/chunk-and-embed", chunkAndEmbed);
router.post("/answer", verifyJWT, answerQuestionFromTranscript);

export default router;
