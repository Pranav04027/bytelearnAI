import { Router } from "express";
import {
  answerQuestionFromTranscript,
  chunkAndEmbed,
} from "../controllers/embedding.controllers.js";

const router = Router();

router.post("/chunk-and-embed", chunkAndEmbed);
router.post("/answer", answerQuestionFromTranscript);

export default router;
