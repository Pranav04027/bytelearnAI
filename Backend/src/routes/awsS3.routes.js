import { Router } from "express";
import {
  getPresignedUploadUrl,
  getVideoPlaybackUrl,
} from "../controllers/awsS3.controllers.js";
import { verifyJWTOptional } from "../middlewares/auth.middlewares.js";

const router = Router();

router.post("/upload-url", verifyJWTOptional, getPresignedUploadUrl);
router.get(
  "/videos/:videoId/playback-url",
  verifyJWTOptional,
  getVideoPlaybackUrl
);

export default router;
