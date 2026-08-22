import { Router } from "express";
import {
  answerQuestionFromTranscript,
  chunkAndEmbed,
} from "../controllers/embedding.controllers.js";

const router = Router();

router.post("/chunk-and-embed", chunkAndEmbed);
// Public: "Ask the Video" RAG should be usable by anyone (e.g. recruiters)
// without logging in.
router.post("/answer", answerQuestionFromTranscript);

export default router;
