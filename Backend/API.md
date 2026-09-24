# ByteLearn Backend API Reference

Base URL: `http://localhost:8000/api/v1`

All endpoints are served under the `/api/v1` prefix. The backend is an Express 5 application backed by PostgreSQL/Prisma with AWS S3 media storage, AWS Transcribe, and Gemini-powered AI features.

## Contents

- [Authentication](#authentication)
- [Common Response Format](#common-response-format)
- [Error Handling](#error-handling)
- [Rate Limiting](#rate-limiting)
- [Endpoints](#endpoints)
  - [Healthcheck](#healthcheck)
  - [Users](#users)
  - [Videos](#videos)
  - [AWS S3 (Presigned Upload / Playback)](#aws-s3)
  - [Playlists](#playlists)
  - [Subscriptions](#subscriptions)
  - [Comments](#comments)
  - [Posts](#posts)
  - [Likes](#likes)
  - [Bookmarks](#bookmarks)
  - [Progress](#progress)
  - [Recommendations](#recommendations)
  - [Quizzes](#quizzes)
  - [Instructor Dashboard](#instructor-dashboard)
  - [Learner Dashboard](#learner-dashboard)
  - [Embeddings & AI Q&A](#embeddings--ai-qa)
- [Media Upload Flow](#media-upload-flow)

---

## Authentication

Authentication is **JWT-based** with `httpOnly` cookies.

### Roles

| Role | Value in DB | Notes |
| --- | --- | --- |
| Learner | `LEARNER` | Default role |
| Instructor | `INSTRUCTOR` | Required for instructor dashboard & manual quiz creation |

### Tokens

- **Access token** — short-lived (default `1h`), sent as `accessToken` cookie, also accepted via `Authorization: Bearer <token>` header. Used on every protected request.
- **Refresh token** — long-lived (default `7d`), sent as `refreshToken` cookie. Used by `POST /users/refresh-token`.

### Cookie options

- `httpOnly: true`, `sameSite: Lax`, `secure: true` in production only.

### Middleware

| Middleware | Behavior |
| --- | --- |
| `verifyJWT` | Requires a valid access token; attaches `req.user` (id, username, email, fullname, avatar, coverImage, role, timestamps). Returns `401` otherwise. |
| `verifyJWTOptional` | Parses the token if present but never rejects; `req.user` set only when a valid token is provided. |
| `checkRole("instructor")` | Rejects with `403` unless `req.user.role === "INSTRUCTOR"`. |

### Authentication flow

1. `POST /users/register` — create an account.
2. `POST /users/login` — sets `accessToken` and `refreshToken` cookies.
3. `POST /users/refresh-token` — rotate the refresh token when the access token expires.
4. `POST /users/logout` — clears cookies and invalidates the stored refresh token.

---

## Common Response Format

Successful responses follow this shape:

```json
{
  "success": true,
  "statusCode": 200,
  "data": {},
  "message": "Human readable message"
}
```

`data` may be an object, array, string, or `null` depending on the endpoint.

---

## Error Handling

Errors are produced by the global error middleware and by controllers. Shape:

```json
{
  "success": false,
  "statusCode": 400,
  "message": "Error description",
  "errors": [],
  "stack": "..." 
}
```

> `stack` is only included when `NODE_ENV=development`.

### Common status codes

| Code | Meaning |
| --- | --- |
| `400` | Bad request / validation failure |
| `401` | Missing/invalid token, bad credentials |
| `403` | Not allowed (not owner / role conflict / unpublished video) |
| `404` | Resource not found |
| `409` | Duplicate resource (user exists, same video title, etc.) |
| `413` | File too large |
| `429` | Rate limit exceeded |
| `500` | Server error |

---

## Rate Limiting

A global limiter is applied to `/api/v1`:

- Window: 15 minutes
- Max: 100 requests per IP
- Response: `429` with `Rate-Limit` headers

---

## Endpoints

### Healthcheck

#### `GET /healthcheck`

No auth. Returns service liveness.

**200 response**

```json
{
  "success": true,
  "statusCode": 200,
  "data": "OK",
  "message": "Health check passed"
}
```

---

### Users

Prefix: `/users`

#### `POST /users/register`

Public. Create a new user account.

**Request body (JSON)**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `fullname` | string | yes | |
| `email` | string | yes | Lowercased |
| `username` | string | yes | Lowercased |
| `password` | string | yes | Hashed with bcrypt |
| `role` | string | no | `learner` (default) or `instructor` |
| `avatarUrl` | string | yes | Public S3 URL, must point at `avatars/` prefix and the object must exist |
| `coverImageUrl` | string | no | Public S3 URL under `coverimages/` prefix |

**201 response** — returns the created user (id, fullname, email, username, role, avatar, coverImage, createdAt, updatedAt).

#### `POST /users/login`

Public. Accepts `email` **or** `username` plus `password`. Sets auth cookies.

**Request body (JSON)**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `email` | string | one of | Lowercased |
| `username` | string | one of | Lowercased |
| `password` | string | yes | |

**200 response** — `data` is the logged-in user. Also sets `accessToken` and `refreshToken` cookies.

#### `POST /users/refresh-token`

No input needed if the `refreshToken` cookie is present; can also pass `{ "refreshToken": "..." }` in the body. Rotates both tokens and sets new cookies.

#### `POST /users/logout`

Auth: `verifyJWT`. Clears cookies and nulls the stored refresh token.

#### `PATCH /users/change-password`

Auth: `verifyJWT`.

**Request body (JSON)**

| Field | Type | Required |
| --- | --- | --- |
| `oldPassword` | string | yes |
| `newPassword` | string | yes |

#### `GET /users/current-user`

Auth: `verifyJWT`. Returns the authenticated user from `req.user`.

#### `PATCH /users/update-account-details`

Auth: `verifyJWT`.

**Request body (JSON)** — at least one required.

| Field | Type | Notes |
| --- | --- | --- |
| `username` | string | Lowercased |
| `email` | string | Lowercased |

#### `GET /users/dashboard`

Auth: `verifyJWT`. Returns the learner dashboard. `data`:

| Field | Description |
| --- | --- |
| `resumeVideos` | In-progress videos (`progress < 90`) |
| `bookmarks` | Bookmarked videos |
| `watchHistory` | Watched videos |
| `quizAttempts` | Quiz attempts (id, score, total, createdAt, video) |

#### `PATCH /users/update-avatar`

Auth: `verifyJWT`.

**Request body (JSON)**

| Field | Type | Required |
| --- | --- | --- |
| `avatarUrl` | string | yes — public S3 URL under `avatars/` |

Old avatar is deleted from S3 if it differs from the new one.

#### `PATCH /users/update-coverimage`

Auth: `verifyJWT`.

**Request body (JSON)**

| Field | Type | Required |
| --- | --- | --- |
| `coverImageUrl` | string | yes — public S3 URL under `coverimages/` |

#### `GET /users/c/:username`

Auth: `verifyJWT`. Returns the public channel profile for a username.

**200 response** — `data` is an array with one channel object including `numberOfSubscribers` and `numberOfChannelsSubscribedto`.

#### `GET /users/watch-history`

Auth: `verifyJWT`. Returns `data` with user details plus `listOfWatchedVideos`, `numberOfVideosWatched`.

---

### Videos

Prefix: `/videos`

#### `GET /videos/v/:videoId`

Auth: optional (`verifyJWTOptional`). Returns a single video with playback URL. Unpublished videos are only visible to their owner.

**200 response** — `data` includes video fields plus:

| Field | Notes |
| --- | --- |
| `_id` | Same as `id` |
| `videoKey` / `videos3Key` | S3 key |
| `thumbnailUrl` | Thumbnail URL |
| `videofile` / `videoPlaybackUrl` | Presigned playback URL (valid 1 hour) |
| `owner` | Owner id, username, avatar, fullname |
| `transcription` | `{ status }` |

#### `GET /videos/getallvideos`

Public. Paginated, filterable, published videos only.

**Query parameters**

| Param | Type | Default | Notes |
| --- | --- | --- | --- |
| `page` | number | `1` | 1-based |
| `limit` | number | `10` | Page size |
| `query` | string | `""` | Searches title & description (case-insensitive) |
| `sortBy` | string | `createdAt` | Field to sort by |
| `sortType` | string | `desc` | `asc` or `desc` |
| `userId` | string | — | Filter by owner |
| `category` | string | — | Filter by category |
| `difficulty` | string | — | `beginner`, `intermediate`, `advanced` |
| `tags` | string | — | Comma-separated or repeated; filters `tags` array |

**200 response**

```json
{
  "success": true,
  "statusCode": 200,
  "data": {
    "total": 123,
    "page": 1,
    "limit": 10,
    "results": [ "..." ]
  },
  "message": "Fetched videos"
}
```

#### `POST /videos/uploadvideo`

Auth: `verifyJWT`. Requires the video and thumbnail to already be in S3 (see [Media Upload Flow](#media-upload-flow)).

**Request body (JSON)**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `title` | string | yes | Unique per owner |
| `description` | string | yes | |
| `difficulty` | string | yes | `beginner`, `intermediate`, or `advanced` |
| `category` | string | yes | |
| `videoKey` or `videos3Key` | string | yes | Must start with `videos/<userId>/` |
| `thumbnailUrl` or `thumbnailURL` | string | yes | Public S3 URL under `thumbnails/` |
| `duration` | string | no | Defaults to `"0"` |

Side effects:
- Creates a `PENDING` transcription record.
- Kicks off AWS Transcribe asynchronously.
- Returns a presigned `videofile`/`videoPlaybackUrl`.

**201 response** — video object with playback URL. `409` if the title already exists for the owner.

#### `DELETE /videos/delete-video/:videoId`

Auth: `verifyJWT`; owner only. Deletes the DB record and the S3 video/thumbnail objects.

**200 response** — `data: "Deleted"`.

#### `PATCH /videos/update-video/:videoId`

Auth: `verifyJWT`; owner only.

**Request body (JSON)**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `title` | string | yes | |
| `description` | string | yes | |
| `category` | string | no | |
| `difficulty` | string | no | `beginner`/`intermediate`/`advanced` |
| `thumbnailUrl` or `thumbnailURL` | string | no | New thumbnail (optional); old one deleted from S3 |

#### `PATCH /videos/toggleispublished/:videoId`

Auth: `verifyJWT`; owner only. Flips `isPublished`.

#### `PATCH /videos/addview/:id`

Auth: `verifyJWT`. Increments the view counter once per user/IP.

**200 response**

```json
{ "counted": true, "views": 42 }
```

The owner viewing their own video returns `{ "counted": false, "views": N }`.

---

### AWS S3

Prefix: `/awsS3`

#### `POST /awsS3/upload-url`

Auth: optional (`verifyJWTOptional`). Generates a presigned PUT URL for direct upload to S3.

**Request body (JSON)**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `mediaType` | string | yes | `avatar`, `coverimage`, `thumbnail`, or `video` |
| `fileName` | string | yes | Sanitized to safe characters |
| `contentType` | string | yes | Must match media type (`image/*` or `video/*`) |
| `fileSize` | number | no | Validated against the per-type max |

Auth requirements: `avatar` and `coverimage` are allowed anonymously; `thumbnail` and `video` require authentication.

**Max sizes**

| mediaType | Max |
| --- | --- |
| `avatar` | 5 MB |
| `coverimage` | 10 MB |
| `thumbnail` | 8 MB |
| `video` | 1 GB |

**200 response**

```json
{
  "success": true,
  "statusCode": 200,
  "data": {
    "mediaType": "thumbnail",
    "visibility": "public",
    "key": "thumbnails/<id>/<timestamp>-<uuid>-<name>.jpg",
    "uploadUrl": "https://...",
    "method": "PUT",
    "expiresIn": 300,
    "headers": { "Content-Type": "image/jpeg" },
    "maxBytes": 8388608,
    "publicUrl": "https://...",
    "shouldPersist": "publicUrl",
    "isPrivate": false
  },
  "message": "Presigned upload URL generated"
}
```

- `visibility` and `isPrivate` come from the canonical media sets in
  `src/utils/aws-s3.js`. In the current repository all four allowed media types,
  including `video`, are classified as `public` (`PRIVATE_MEDIA_TYPES` is empty).
- `shouldPersist` is `publicUrl` for the current public classification. Video
  creation and playback endpoints still accept/return their existing video key and
  playback URL fields; this documentation reflects the current helper behavior and
  does not change it.
- For videos, the generated key includes the user id, e.g. `videos/<userId>/...` — required later by `POST /videos/uploadvideo`.

#### `GET /awsS3/videos/:videoId/playback-url`

Auth: optional (`verifyJWTOptional`). Returns a fresh presigned playback URL for a video.

**200 response**

```json
{
  "success": true,
  "statusCode": 200,
  "data": {
    "videoId": "...",
    "key": "videos/...",
    "playbackUrl": "https://..."
  },
  "message": "Playback URL generated"
}
```

---

### Playlists

Prefix: `/playlists`

| Method & Path | Auth | Description |
| --- | --- | --- |
| `POST /playlists/create-playlist` | JWT | Create a playlist. Body: `name`, `description`, `videos` (array of video ids) |
| `GET /playlists/my-playlists` | JWT | List the current user's playlists |
| `GET /playlists/p/:userId` | Public | List any user's playlists |
| `PATCH /playlists/p/:playlistId/v/:videoId` | JWT | Add a video to a playlist (owner only, idempotent) |

---

### Subscriptions

Prefix: `/subscriptions`

| Method & Path | Auth | Description |
| --- | --- | --- |
| `GET /subscriptions/subscribers/:channelId` | Public | List subscribers of a channel |
| `GET /subscriptions/subscribed-channels/:subscriberId` | Public | List channels a user subscribes to |
| `POST /subscriptions/togglesubscription/:channelId` | JWT | Subscribe/unsubscribe (toggle) |

---

### Comments

Prefix: `/comments`

| Method & Path | Auth | Description |
| --- | --- | --- |
| `GET /comments/getvideocomments/:videoId` | Public | Paginated comments (`page`, `limit` query params). Response `data`: `{ totalComments, page, limit, all_comments }` |
| `POST /comments/comment/:videoId` | JWT | Add comment. Body: `content`. Duplicate exact comments are rejected as spam |
| `POST /comments/updatecomment/:commentId` | JWT | Update own comment. Body: `content` |
| `POST /comments/deletecomment/:commentId` | JWT | Delete own comment |

---

### Posts

Prefix: `/posts`

| Method & Path | Auth | Description |
| --- | --- | --- |
| `GET /posts/userposts/:userId` | Public | List a user's posts (newest first) |
| `POST /posts/createpost` | JWT | Create post. Body: `content` |
| `PATCH /posts/updatepost/:postId` | JWT | Update own post. Body: `content` |
| `DELETE /posts/deletepost/:postId` | JWT | Delete own post |

---

### Likes

Prefix: `/likes`

All like endpoints toggle (like/unlike). All require JWT.

| Method & Path | Description |
| --- | --- |
| `POST /likes/likevideo/:videoId` | Toggle video like |
| `POST /likes/likecomment/:commentId` | Toggle comment like |
| `POST /likes/likepost/:postId` | Toggle post like |
| `GET /likes/likedvideos` | List liked videos. `data` is an array of `{ _id, createdAt, videoDetails }` |

---

### Bookmarks

Prefix: `/bookmarks`

All require JWT.

| Method & Path | Description |
| --- | --- |
| `POST /bookmarks/addBookmark/:videoId` | Bookmark a video |
| `DELETE /bookmarks/removeBookmark/:videoId` | Remove a bookmark |
| `GET /bookmarks/mybookmarks` | List own bookmarks (includes video) |

---

### Progress

Prefix: `/progress`

All require JWT.

| Method & Path | Description |
| --- | --- |
| `POST /progress/update/:videoId` | Update watch progress. Body: `{ "percent": number }`. Adds to watch history automatically when `percent >= 95` |
| `GET /progress/get` | List all progress records (includes video metadata) |
| `GET /progress/continue` | Continue watching: videos with `0 < progress < 95`. Returns flattened `{ videoId, title, thumbnail, duration, progress, category, difficulty }` objects |

---

### Recommendations

#### `GET /recommendations/recommended`

Auth: `verifyJWT`. Personalized recommendations derived from the user's completed content (progress ≥ 65%) and bookmarks. Matches on tags, categories, and difficulty; excludes already-interacted videos; falls back to latest published videos. Returns up to 15 videos.

---

### Quizzes

Prefix: `/quizzes`

#### `POST /quizzes/create/:videoId`

Auth: `verifyJWT` + `checkRole("instructor")`. Manually create a quiz.

**Request body (JSON)**

```json
{
  "questions": [
    {
      "questionText": "string",
      "questionConcept": "string",
      "options": [
        { "text": "A", "isCorrect": false },
        { "text": "B", "isCorrect": true }
      ]
    }
  ]
}
```

Each question must have ≥ 2 options and exactly 1 correct option.

#### `POST /quizzes/create-ai/:videoId`

Auth: `verifyJWT`. Generates a quiz (5 questions) from the video transcript using Gemini. If a quiz already exists for the video, it returns the existing quiz with `200`.

**Errors** — `404` video not found; `400` transcript not ready; `500` AI did not generate a valid quiz.

#### `GET /quizzes/isquiz/:videoId`

Auth: `verifyJWT`. `data: { "exists": boolean }`.

#### `GET /quizzes/:videoId`

Auth: `verifyJWT`. Returns the quiz with questions and options.

#### `POST /quizzes/:videoId/submit`

Auth: `verifyJWT`. Submit answers and get scored. Limited to `QUIZ_ATTEMPT_LIMIT` attempts per user/video (default `2`).

**Request body (JSON)**

```json
{
  "answers": [
    { "question": "<questionId>", "selectedOption": "<optionId>" }
  ]
}
```

**200 response** — `data`:

```json
{
  "attemptId": "...",
  "score": 4,
  "totalPercentage": 80,
  "totalQuestions": 5,
  "correctAnswers": 4,
  "correctConcepts": ["..."],
  "wrongConcepts": ["..."],
  "result": [
    { "question": "...", "selectedOption": "...", "isCorrect": true }
  ]
}
```

The attempt is saved to learner memory (Supermemory).

---

### Instructor Dashboard

Prefix: `/instructor`

All routes require `verifyJWT` + `checkRole("instructor")`.

| Method & Path | Description |
| --- | --- |
| `GET /instructor/dashboard/stats` | Channel stats: `totalViews`, `totalSubscribers`, `totalVideos`, `totalLikes`, `totalPosts` |
| `GET /instructor/dashboard/videos/:userId` | Channel videos with `videofile` (presigned URL) and `ownerDetails` |
| `POST /instructor/dashboard/likes-by-video` | Body: `{ "videoIds": [...] }`. Returns a map of `videoId -> likeCount` |
| `GET /instructor/dashboard/watch-stats` | `{ totalWatchTimeHours, avgViewDurationSeconds }` computed from progress records |

---

### Learner Dashboard

#### `GET /learner/dashboard`

Auth: `verifyJWT`. Same shape as `GET /users/dashboard`. `data`:

- `resumeVideos` — progress `< 90`
- `bookmarks` — bookmarked videos
- `watchHistory` — watched videos
- `quizAttempts` — quiz attempts (id, score, total, createdAt, video)

---

### Embeddings & AI Q&A

Mounted prefix: `/api/v1/embeddings` (`src/app.js` plus
`src/routes/embedding.routes.js`). Both routes below have no JWT middleware.
Public access does not bypass the application body limits, sanitization, CORS or
rate limiting. The streaming answer is an exception to the common JSON success
envelope documented above.

#### `POST /embeddings/chunk-and-embed`

Public preparation route; not called for every question. Accepts `{ "videoId": "..." }`.
It loads AWS transcript JSON from S3 `transcripts/<videoId>.json`, builds timestamp-aware
chunks targeting about 500 characters, embeds them, validates and transactionally
replaces that video's `TranscriptChunk` rows. A request `transcript` field is not
an override. This operation writes data and uses providers; it is not a setup probe.
A transcription record is needed for the final status update to `READY`.

**200 response**

```json
{
  "success": true,
  "statusCode": 200,
  "data": { "videoId": "...", "chunksCreated": 12 },
  "message": "Transcript chunks and embeddings created"
}
```

#### `POST /embeddings/answer`

Exact full endpoint: **POST `/api/v1/embeddings/answer`**. Anonymous/public;
no Authorization header, account or cookie is required. The frontend may include
cookies for its shared application origin, but RAG does not use them for ownership.

**Request body (`Content-Type: application/json`)**

```json
{
  "videoId": "existing-video-id",
  "question": "Explain the concept introduced in this video.",
  "conversationId": "c2546993-222c-4615-9729-e3dafbdc87f1"
}
```

| Field | Required validation / meaning |
| --- | --- |
| `videoId` | Nonblank string; exact product video scope for retrieval and conversation. Controller does not trim the value or validate video existence/publication here. |
| `question` | String, trimmed and nonempty; current turn input. No separate question-length validator beyond the application's body limit (16kb JSON for this route). |
| `conversationId` | UUID string matching version nibble 1–8 and RFC variant 8/9/a/b (case-insensitive); frontend generates UUID v4. Required resume identifier, not authentication. |

The controller derives internal `thread_id` as SHA-256 of
`JSON.stringify([videoId, conversationId.toLowerCase()])`. Clients send the public
ID, not internal checkpoint keys. Same video/ID continues state; a new ID or other
video isolates a thread. Neither public nor internal ID authenticates a user.
Anyone with both public identifiers can attempt continuation. Same-thread overlap
returns HTTP 409 using a **process-local** guard; no distributed lock is claimed.

**Before SSE**

- HTTP 400 JSON `{ success: false, message }` for missing/blank video or question,
  or invalid conversation UUID.
- HTTP 409 JSON `{ success: false, message }` for an already running conversation.
- Other pre-stream failures use the global JSON error handler; missing embedding
  API configuration is a 500. Middleware may reject malformed/oversized/rate-limited
  requests before controller validation.

**SSE** (`Content-Type: text/event-stream`)

Frames contain `event: <name>` and a JSON `data:` payload, followed by a blank line.
Network chunks are not frame or UTF-8 character boundaries.

| Event | Payload | Meaning |
| --- | --- | --- |
| `start` | `{ "videoId": "..." }` | Stream opened |
| `token` | `{ "text": "..." }` | Nonempty answer fragment; may contain more than one model token |
| `done` | `{ "answer": "...", "sources": [] }` | Final answer and cited current-source metadata after successful graph completion; stream ends |
| `error` | `{ "message": "Failed to stream answer" }` | Failure after stream opened, if transport remains writable; stream ends |

Each source contains `sourceId`, `chunkIndex`, `startMs`, `endMs`, `similarity`
(numbers or null where unavailable). `sourceId` is 1-based current retrieval rank;
timestamps are milliseconds. A lexical-only source can have null similarity.
Only cited valid current ranks receive metadata. Citation-ID filtering does not
prove semantic support and does not guarantee all invalid marker text is removed.

Successful ordering is **`start → token* → done`**. Partial output can appear before
an error, but failure never produces a later `done`. Unexpected EOF without `done`
is not successful completion. Client disconnect/socket failure aborts local work
and suppresses further writes; no terminal event is guaranteed on a broken socket.

Valid zero fresh retrieval matches skip the model and produce a token containing
exactly `I couldn't find enough information in this video to answer that.` followed
by `done` with that answer and `sources: []`. Critical retrieval failures produce
errors, not abstention. Lexical failure alone falls back to dense retrieval.
Nonempty evidence is subject to grounding/abstention instructions and citation-ID
validation, not a semantic correctness guarantee.

Tokens are drafts. Completed history is recorded only through successful graph
finalization. A durable completion can precede a lost `done`; retrying the same
question can create another turn. There is no exactly-once delivery or stream
resumption. A checkpoint write acknowledgement failure can leave commit status
ambiguous. Provider cancellation does not prove immediate remote cost termination.

Fresh retrieval runs every turn. Narrow follow-ups can use one preceding human
question for interpretation; prior AI answers are never factual evidence.
Public RAG does not consult or save Supermemory learner profiles. See the
[architecture](BYTELEARN_V2_ARCHITECTURE_MAP.md) for active four-pair history,
persistence, model inputs and other limitations.

---

## Media Upload Flow

The platform stores media in S3. The current `aws-s3.js` media sets classify
avatar, coverimage, thumbnail and video as public; video endpoints still expose
the existing playback URL fields and the upload route returns a presigned PUT
URL for the upload operation.

1. **Request an upload URL** — `POST /awsS3/upload-url` with `mediaType`, `fileName`, `contentType`, `fileSize`. Returns a presigned `PUT` URL, the resulting `key`, and a `publicUrl` for the current public classification.
2. **Upload** — perform a `PUT` to the returned `uploadUrl` with the `Content-Type` header and the raw bytes.
3. **Persist** — send the field expected by the relevant endpoint. Account/avatar endpoints use the public URL; video creation accepts its existing `videoKey`/`videos3Key` and `thumbnailUrl` fields:
   - `POST /users/register`, `PATCH /users/update-avatar`, `PATCH /users/update-coverimage`
   - `POST /videos/uploadvideo` (requires both `videoKey` and `thumbnailUrl`)
4. **Playback** — request `GET /awsS3/videos/:videoId/playback-url` (or use the `videofile`/`videoPlaybackUrl` returned by video endpoints) to obtain the current playback URL behavior.

> The backend validates that submitted URLs point at this S3 bucket with the expected prefix and that the object exists before persisting.
