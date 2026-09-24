import { afterAll, expect, it, vi } from "vitest";

vi.hoisted(() => {
  vi.stubEnv("AWS_REGION", "us-east-1");
  vi.stubEnv("S3_BUCKET_NAME", "test-media");
  vi.stubEnv("S3_PUBLIC_BASE_URL", "https://media.example.test");
});
vi.mock("../db/index.js", () => ({ prisma: {} }));
vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn(async () => "https://upload.example.test/signed"),
}));

import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getPresignedUploadUrl } from "../controllers/awsS3.controllers.js";

afterAll(() => vi.unstubAllEnvs());

function response() {
  return { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
}

it.each([
  ["avatar", "image/png", "portrait.png", undefined, "avatars/", 5 * 1024 * 1024],
  ["video", "video/mp4", "lesson.mp4", { id: "instructor" }, "videos/instructor/", 1024 * 1024 * 1024],
])("returns the successful public %s upload contract after signing", async (
  mediaType, contentType, fileName, user, prefix, maxBytes,
) => {
  const res = response();
  const next = vi.fn();
  await getPresignedUploadUrl({
    body: { mediaType, contentType, fileName, fileSize: 1024 }, user,
  }, res, next);

  expect(next).not.toHaveBeenCalled();
  expect(res.status).toHaveBeenCalledExactlyOnceWith(200);
  expect(res.json).toHaveBeenCalledTimes(1);
  const payload = res.json.mock.calls[0][0];
  expect(payload.data.key.startsWith(prefix)).toBe(true);
  expect(payload).toEqual({
    success: true,
    statusCode: 200,
    data: {
      mediaType,
      visibility: "public",
      key: expect.any(String),
      uploadUrl: "https://upload.example.test/signed",
      method: "PUT",
      expiresIn: 300,
      headers: { "Content-Type": contentType },
      maxBytes,
      publicUrl: `https://media.example.test/${payload.data.key}`,
      shouldPersist: "publicUrl",
      isPrivate: false,
    },
    message: "Presigned upload URL generated",
  });
  expect(getSignedUrl).toHaveBeenCalledTimes(1);
  const [, command, options] = getSignedUrl.mock.calls[0];
  expect(command).toBeInstanceOf(PutObjectCommand);
  expect(command.input).toEqual({
    Bucket: "test-media", Key: payload.data.key, ContentType: contentType,
  });
  expect(options).toEqual({ expiresIn: 300 });
});

it("still requires authentication for video upload URLs before signing", async () => {
  const res = response();
  const next = vi.fn();
  await getPresignedUploadUrl({ body: {
    mediaType: "video", contentType: "video/mp4", fileName: "lesson.mp4",
  } }, res, next);
  expect(next).not.toHaveBeenCalled();
  expect(res.status).toHaveBeenCalledExactlyOnceWith(401);
  expect(res.json).toHaveBeenCalledExactlyOnceWith({
    success: false, message: "Authentication required for video upload URL",
  });
  expect(getSignedUrl).not.toHaveBeenCalled();
});
