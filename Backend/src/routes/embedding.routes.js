import { Router } from "express";
import { chunkAndEmbed } from "../controllers/embedding.controllers.js";

const router = Router();

router.post("/chunk-and-embed", chunkAndEmbed);

export default router;
