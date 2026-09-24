# Backend setup and configuration

ByteLearn's public conversational RAG uses a shared LangGraph runtime with
PostgreSQL checkpoints. See the [implemented architecture](BYTELEARN_V2_ARCHITECTURE_MAP.md)
and [answer API](API.md#embeddings--ai-qa). These instructions are setup procedures,
not evidence that the final application was live-verified.

## Dependencies and versions

Observed locally on 2026-09-24: Node **20.20.2**, npm **10.8.2**. Neither is pinned
by a repository engines/packageManager field. For the checked-in dependency stack,
use Node satisfying Prisma's `^20.19 || ^22.12 || >=24.0` and Vite's
`^20.19.0 || >=22.12.0` engine declarations (the observed Node version satisfies both).

Values below come from `package.json`, `package-lock.json` and installed package
manifests; the lockfile and installed versions agree at this snapshot.

| Package | Direct declaration | Locked/installed |
| --- | --- | --- |
| `@langchain/core` | `1.2.11` | 1.2.11 |
| `@langchain/google` | `0.2.0` | 0.2.0 |
| `@langchain/langgraph` | `1.4.13` | 1.4.13 |
| `@langchain/langgraph-checkpoint-postgres` | `1.0.5` | 1.0.5 |
| `langsmith` | `^0.8.11` | 0.8.11 |
| `pg` | `^8.20.0` | 8.20.0 |
| `prisma` (development CLI) | `^7.8.0` | 7.8.0 |
| `@prisma/client`, `@prisma/adapter-pg` | `^7.5.0` each | 7.5.0 each |
| `@google/generative-ai` (embeddings/legacy quiz) | `^0.24.1` | 0.24.1 |
| `supermemory` (legacy quiz only) | `^4.17.0` | 4.17.0 |
| `openevals` (development evaluator) | `^0.2.2` | 0.2.2 |
| `@langchain/google-genai` (development judge) | `^2.2.0` | 2.2.0 |

The answer model is fixed in `src/models/answerChatModel.js`:
`gemini-2.5-flash-lite`, temperature 0.7, topP 0.95, topK 64,
maxOutputTokens 8192. It uses `ChatGoogle` from `@langchain/google/node`.
Embedding defaults are separate: `gemini-embedding-001`, first 768 values,
via the raw Gemini SDK. The offline judge defaults to `gemini-2.5-flash`,
temperature 0, with optional `EVAL_JUDGE_MODEL`; it is not the public answer model.

## Development setup

Use a database and cloud resources explicitly designated for development. Server
startup starts transcription polling after readiness and can process pending jobs;
do not use unverified existing credentials merely to test startup. Database setup
commands below write schema and are not read-only validation. No production
migration/deployment procedure is established by this roadmap.

1. From `Backend/`, install the locked dependencies:

   ```bash
   npm ci
   ```

2. Create `Backend/.env` if it does not already exist; use `.env.example` as a
   starting template without overwriting an existing file. **Add `GEMINI_API_KEY`**:
   the checked-in template omits this required RAG setting. `.env` is loaded by
   `src/index.js` and the setup CLI; Prisma CLI loads it from the backend working
   directory. Do not use the empty `src/.env.sample` as a complete configuration.

   | Variable | Purpose / requirement |
   | --- | --- |
   | `DATABASE_URL` | Required existing product PostgreSQL database for Prisma/pgvector |
   | `LANGGRAPH_DATABASE_URL` | Required checkpoint PostgreSQL URL; no fallback to `DATABASE_URL` |
   | `GEMINI_API_KEY` | Required for live question embedding and answer generation |
   | `PORT` | Backend port, default 8000 |
   | `CORS_ORIGIN` | Frontend origin, e.g. `http://localhost:5173` |
   | `NODE_ENV` | Use `development` locally; affects cookies/error detail, does not prove database safety |
   | `ACCESS_TOKEN_SECRET`, `ACCESS_TOKEN_EXPIRY`, `REFRESH_TOKEN_SECRET`, `REFRESH_TOKEN_EXPIRY` | Configure account/quiz/protected app flows; template expiries 1h and 7d; public answer does not require login |
   | `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET_NAME` | Upload/transcription/preparation and media workflows; use development resources and suitable S3/Transcribe permissions |
   | `S3_PUBLIC_BASE_URL` | Optional public-media URL override |
   | `INTERNAL_API_BASE_URL` | Optional poller callback origin; default `http://127.0.0.1:${PORT or 8000}` |
   | `GEMINI_EMBEDDING_MODEL` | Optional, default `gemini-embedding-001`; old `text-embedding-004` value maps to default |
   | `GEMINI_API_VERSION`, `GEMINI_API_BASE_URL` | Optional embedding API overrides, default `v1beta` and `https://generativelanguage.googleapis.com` |
   | `SUPERMEMORY_API_KEY` | Optional legacy quiz memory; not required for public RAG or app import |
   | `LANGSMITH_TRACING`, `LANGSMITH_API_KEY` | Optional tracing requires literal `true` and a nonempty key; set `LANGSMITH_TRACING=false` for local work without telemetry |
   | `LANGSMITH_PROJECT`, `LANGSMITH_ENDPOINT` | Optional project (default `byteLearn`) and tracing endpoint |
   | `QUIZ_ATTEMPT_LIMIT` | Separate quiz setting; template value 2 |

   `CLOUDINARY_*` placeholders in the template are not part of the current S3/RAG
   setup. Never put backend credentials in frontend `VITE_*` variables.

3. Prepare an existing development product database with PostgreSQL extension
   support. `prisma/schema.prisma` declares `vector` (pgvector) and `uuid-ossp`
   in schema `extensions`; ensure the extensions/schema can be provisioned by the
   database role. Product tables and timestamped embedded `TranscriptChunk` rows
   are prerequisites for meaningful answers. No Prisma migration directory is
   checked in; do not assume `migrate deploy` can create this application schema.
   For a new/disposable development database, inspect the schema before running:

   ```bash
   npm run db:generate
   npm run db:push
   ```

   `db:generate` writes the local Prisma client; `db:push` synchronizes the target
   database and may report destructive changes. Do not add force/reset/data-loss
   flags. Preparing video transcripts requires the separate S3/AWS Transcribe and
   Gemini ingestion path; installing schema alone does not seed playable videos.

4. Configure the checkpoint endpoint as a **direct or session-mode** connection
   to an existing database (which may also hold the product schema), then run:

   ```bash
   npm run langgraph:setup
   ```

   This invokes `scripts/setup-langgraph.js` and official `PostgresSaver.setup()`
   for the fixed `bytelearn_langgraph` schema. Run setup sequentially; successful
   sequential repeats use package migration versions. Runtime does not migrate.
   The checkpoint role needs setup privileges and runtime read/write access.
   It owns a dedicated pool, separate from Prisma.

   `LANGGRAPH_DATABASE_URL` accepts `postgres:`/`postgresql:` with a host/database,
   and rejects port 6543, a `pgbouncer` parameter, transaction/statement `pool_mode`,
   or URL fragments. These restrictions apply to the checkpoint URL, not a blanket
   rule for `DATABASE_URL`. Verify actual proxy mode; URL checks cannot prove it.

5. Start the backend from `Backend/`:

   ```bash
   npm run dev
   ```

   `npm start` runs without watch mode. Product DB connection and saver/table
   readiness must succeed before HTTP listening and polling. Default liveness
   endpoint: `http://localhost:8000/api/v1/healthcheck`. Readiness is not a complete
   live-provider or persistence acceptance test.

6. In a separate terminal, follow [frontend setup](../Frontend/README.md).

## Conversation persistence and lifecycle

The backend uses `@langchain/langgraph-checkpoint-postgres` **1.0.5**, with the
package's default message-aware serializer. Its tables live in the fixed
`bytelearn_langgraph` schema, separate from the transcript/pgvector and Prisma
product schema. Keep this schema out of exposed Data API schemas, and restrict
access to the database roles that need it. Serialization does not encrypt data.
Database access controls, backups and encryption remain operator responsibilities.

`conversationalRagRuntime.js` owns one compiled graph and one dedicated checkpoint
resource per backend process. `postgresCheckpointer.js` constructs its own `pg.Pool`
and `PostgresSaver`; it never borrows or closes Prisma's pool. Imports perform no
DB I/O and register no signal handlers. Concurrent initialization shares a promise.
Startup verifies connectivity and checkpoint tables through a saver read before
HTTP listening; it never executes setup. Initialization failure is terminal for
that runtime and closes its owned pool. There is no in-memory fallback.

The explicit setup command uses the same validated URL and schema, calls official
`setup()`, and closes its own pool. Successful sequential repetitions are
idempotent through the package's migration-version table. Setup or cleanup errors
exit non-zero. Missing `LANGGRAPH_DATABASE_URL` fails clearly, including when
`DATABASE_URL` exists. No URLs or driver error details are intentionally logged by
the new persistence boundary.

During invocation, database failures reject the operation. The existing controller
sends its generic SSE `error` if the transport is still writable; it cannot report
success by switching to non-durable state. Generation failures and cancellation
before finalization do not append completed partial AI responses. Intermediate
checkpoints, human messages and draft answers can remain.

Only the executable entrypoint registers shutdown handlers. SIGINT/SIGTERM share
one shutdown: stop accepting HTTP, drain requests/runtime operations, then close
the owned checkpoint pool exactly once. Repeated close calls share the same
result, including cleanup failure. Cleanup failure exits non-zero. A 15-second
entrypoint deadline forces a non-zero exit if shutdown hangs; graceful closure
cannot be guaranteed in that case or after a crash/SIGKILL. Existing Prisma and
transcription-polling resources remain owned by their subsystems.

## What checkpoints store

Snapshots can contain all of the following, including historical intermediate
snapshots rather than only the latest completed turn:

- Human and AI messages, including exact user questions and completed answers.
- Video identifiers and the hashed, video-scoped internal thread identifier.
- Current question and contextual retrieval query (which may include a prior question).
- Transcript matches: content, chunk index, timestamps and similarity.
- Current answer, including a draft before citation validation/finalization.
- Citation sources: source IDs, chunk indexes, timestamps and similarity.
- Intermediate status (`pending`, `draft`, `validated`, `complete`).
- Official checkpoint metadata, channel versions, pending writes and task error
  names/messages. Error text is not automatically redacted by the saver.

Database clients, pools, callbacks, request/response objects, abort controllers
and configuration credentials are not application-state fields. Evidence is
projected to data fields before entering state. This is not a guarantee that
arbitrary user/transcript/error text contains no secrets. Treat the checkpoint
schema and its backups as sensitive. The latest active state retains the newest
four completed human/AI pairs using reducer-aware removal at successful
finalization. Failed inputs are cleaned before the next turn. Four pairs are not
a token bound; older snapshots remain. There is no retention-deletion policy,
custom archive or visible-history restoration. Existing automatic
LangGraph/model tracing shields and manually projected tracing payloads remain;
checkpoint storage is a separate storage boundary.

## Guarantees and limits

Reusing the same scoped thread can restore conversation context through a new
runtime after the original pool closes. Different conversation IDs and the same
public ID under different videos stay isolated. These IDs are not authentication
or access control. Overlap rejection remains process-local, not a distributed lock;
Concurrent multi-process writers for one thread are not coordinated.

Persistence and browser receipt are separate. A checkpoint can commit and the
client can disconnect before receiving `done`. Retrying may duplicate work:
`conversationId` identifies a thread, not a unique request. There is no
idempotency key, retry infrastructure, exactly-once HTTP delivery or distributed
transaction. A fully committed answer whose delivery failed is different from an
unfinished partial AI turn.

## Safe PostgreSQL verification

First obtain explicit confirmation that the target is a disposable or otherwise
safe development/test database and may receive checkpoint tables and synthetic
records. Do not infer safety from a URL or `NODE_ENV`. Never run these checks
against production. Configure `LANGGRAPH_DATABASE_URL` privately in the shell;
do not paste credentials into logs or reports. It must identify an existing
database using a verified direct/session connection. The setup CLI may load
`Backend/.env`, but the integration test deliberately never loads `.env` and
never falls back to `DATABASE_URL`; export the same dedicated URL for all commands.

From `Backend/`, with the safe target confirmed:

```bash
npm run langgraph:setup
npm run langgraph:setup
LANGGRAPH_TEST_DATABASE_CONFIRMED=true npm test -- src/test/langgraphPersistence.integration.test.js
```

The integration test skips unless explicitly opted in. When opted in it fails for
missing/invalid configuration or obvious production markers. These checks do not
prove safety; the opt-in represents the operator's explicit confirmation. The
test uses real PostgreSQL, saver, pools and graph with fake retrieval/generation,
unique scoped IDs and narrowly targeted `deleteThread` cleanup. It checks context
restoration after closing and recreating runtimes, isolation, cancellation/failure
state and serialization. It never runs setup implicitly.

A passing integration test proves new-runtime/new-pool continuity, not an actual
backend-process restart, browser/UI behavior or deployed behavior. Those require
separate checks. Unit tests and a skipped integration test do not prove durable
restart continuity. Run the ordinary suite without the opt-in for DB-free checks:

```bash
LANGGRAPH_TEST_DATABASE_CONFIRMED=false npm test
```

## Accepted verification

[Stage 9](docs/stage-9-acceptance.md) records **repository/integration acceptance
PASS**: backend 268 passed / 1 gated PostgreSQL skip, frontend 17 passed.
**Full live acceptance NOT RUN**: real PostgreSQL at Stage 9, complete backend
process restart, real Gemini, actual-video/browser flows and development deployment.
Historical Stages 5/6 disposable PostgreSQL results remain separate evidence.
Stage 10 later found and repaired one missing canonical S3 controller import; its
focused regression passed, and the complete post-repair backend regression passed
271 tests / 1 gated PostgreSQL skip. This later result does not change the Stage 9
snapshot or establish full live acceptance.
