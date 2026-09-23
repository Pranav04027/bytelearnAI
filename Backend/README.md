# Backend Setup

## Prerequisites

- Node.js >=20 for this dependency stack
- A PostgreSQL database (dedicated/session mode only; see Supported Configuration below)

## Environment

Copy `.env.example` to `.env`, then fill in the secrets.

Required environment variables:
- `LANGGRAPH_DATABASE_URL` - Required. Direct or session-mode PostgreSQL connection string.
  No `DATABASE_URL` fallback is used for LangGraph persistence.
- `DATABASE_URL` - Used by Prisma ORM (existing).
- All other `.env.example` variables remain in effect.

Example:

```env
LANGGRAPH_DATABASE_URL=postgresql://user:pass@localhost:5432/bytelearn_langgraph
DATABASE_URL=postgresql://postgres.your-project-ref:your-password@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require
NODE_ENV=development
```

## Supported Configuration

Only direct and session-mode connections are supported. Arbitrary proxy mode cannot be
inferred from URL alone; operators must verify their endpoint.

Unsupported:
- `pool_mode=transaction` or `pool_mode=statement`
- `pgbouncer` query parameter
- Port `6543` (typical pgbouncer port)
- Any URL without a valid `postgres:` or `postgresql:` protocol and `hostname`

## LangGraph Setup

The LangGraph checkpoint schema is owned separately. Do not modify Prisma schema.

```bash
npm run langgraph:setup
```

This creates schema/tables and runs package migrations. Run setup commands sequentially.
The runtime never migrates automatically.

## Sync Prisma

From `Backend/`:

```bash
npm run db:push
```

## Run The Backend

From `Backend/`:

```bash
npm run dev
```

## Useful Commands

```bash
npm run db:generate
npm run db:studio
npm run langgraph:setup
```
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
schema and its backups as sensitive. Stage 5 adds no retention policy, history
trimming, custom message tables or visible-history restoration. Existing automatic
LangGraph/model tracing shields and manually projected tracing payloads remain;
checkpoint storage is a separate storage boundary.

## Guarantees and limits

Reusing the same scoped thread can restore conversation context through a new
runtime after the original pool closes. Different conversation IDs and the same
public ID under different videos stay isolated. These IDs are not authentication
or access control. Overlap rejection remains process-local, not a distributed lock;
Stage 5 does not make concurrent multi-process writers safe for one thread.

Persistence and browser receipt are separate. A checkpoint can commit and the
client can disconnect before receiving `done`. Retrying may duplicate work:
`conversationId` identifies a thread, not a unique request. Stage 5 adds no
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
