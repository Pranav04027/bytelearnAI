# Stage 5 Implementation Evidence Packet

## A. Stage outcome

Stage 5 moves production conversation checkpoints from process-local `MemorySaver` to official `PostgresSaver` 1.0.5. A dedicated PostgreSQL pool now outlives individual requests, while stored state survives replacing the runtime and pool. Real PostgreSQL verification demonstrated that continuity using a disposable local database; it did not restart the complete Express backend process. Graph nodes, retrieval, Gemini settings, citations, public request/SSE contracts, frontend identity, cancellation and overlap behavior remain unchanged.

## B. Before and after

| Concern | Stage 4 | Stage 5 |
|---|---|---|
| Checkpointer | `MemorySaver` | Official `PostgresSaver` |
| Memory lifetime | Node process | PostgreSQL checkpoint lifetime |
| Runtime ownership | Singleton compiled graph | Singleton runtime owns graph and dedicated pool/saver |
| Setup | None | Explicit `npm run langgraph:setup` |
| Shutdown | Memory disappears with process | Drain operations; close owned pool once |
| Failure | No checkpoint database dependency | Explicit configuration, initialization or invocation failure; no memory fallback |
| Restart | Prior context unavailable | Same scoped thread loads persisted state |

## C. Production file map

Paths are relative to the repository root. Tests and this packet are separate from production files.

| Path | Before | Stage 5 change | Callers/dependents |
|---|---|---|---|
| `Backend/src/graphs/conversationalRagRuntime.js` | Immediately compiled singleton with default memory saver | Lazy shared PostgreSQL initialization, injected saver, operation tracking and close | Answer controller; entrypoint |
| `Backend/src/graphs/postgresCheckpointer.js` | Absent | URL validation, dedicated pool, official saver, verification/setup/close resource | Runtime; setup script |
| `Backend/scripts/setup-langgraph.js` | Absent | Explicit official setup, safe failure messages and cleanup | npm setup command |
| `Backend/src/index.js` | Connected Prisma, listened, started polling | Waits for checkpoint initialization; coordinated signals, drain, timeout; prevents listening after shutdown begins | npm start/dev |
| `Backend/package.json` | No PostgreSQL saver/setup command | Exact dependency and `langgraph:setup` script | npm/runtime/tooling |
| `Backend/package-lock.json` | Existing dependency tree | One added package record and root dependency entry | npm installation |
| `Backend/.env.example` | Only product database configuration | Placeholder `LANGGRAPH_DATABASE_URL` | Developer configuration |
| `Backend/README.md` | Basic backend setup | Persistence configuration, lifecycle, storage, verification and limits | Operators/developers |

`conversationalRagGraph.js` is unchanged. Its default `MemorySaver` remains available for directly constructed isolated graphs/tests; production explicitly injects PostgreSQL.

## D. Lifecycle and ownership

1. **Startup:** the entrypoint uses existing dotenv configuration and imports the application. After existing Prisma connection startup succeeds, it awaits runtime initialization before listening or starting polling.
2. **Creation:** one shared initialization promise creates a resource-owned `pg.Pool`, then `new PostgresSaver(pool, undefined, { schema: "bytelearn_langgraph" })`. The inherited default `JsonPlusSerializer` restores message objects. A saver `getTuple()` read verifies connectivity/table availability before graph compilation.
3. **Invocation:** the unchanged controller invokes the shared runtime. Graph configuration retains `configurable.thread_id`, empty automatic callbacks and `durability: "sync"`. The framework reads checkpoints and writes intermediate/final state through the injected saver. No setup or pool construction occurs per request.
4. **Setup:** `npm run langgraph:setup` uses the same validated configuration and schema, calls official `setup()`, then closes its separately owned pool. Sequential repetitions consult package migration versions; concurrent setup is not promised safe.
5. **Shutdown:** entrypoint SIGINT/SIGTERM handlers share one shutdown promise. HTTP requests drain, then runtime operations/initialization drain and the checkpoint resource closes its pool once. Cleanup failure exits non-zero; a 15-second deadline forces failure if shutdown hangs.

Only the resource calls its pool's `end()`. Calling saver `end()` as well would duplicate closure because that API delegates to the same pool. Prisma's existing pool and polling subsystem are not borrowed or closed by checkpoint code. Library imports register no signal handlers and perform no database I/O.

## E. Restart continuity walkthrough

The controller reconstructs `thread_id` as SHA-256 of `JSON.stringify([videoId, conversationId.toLowerCase()])`.

The live test completed Q1, **“Explain closures.”**, confirmed a human/AI pair, and closed runtime A and its pool. A genuinely new runtime B/saver/pool loaded that thread and restored messages with working `getType()` methods. Q2, **“Why?”**, produced retrieval query `Explain closures.\nWhy?`; generation received Q1 as `previousQuestion`. Another conversation ID and another video both retrieved only `Why?`, proving isolation.

This tests the persistence boundary used after backend restart, not a full backend-process shutdown/relaunch. In that latter scenario, the new process can reconstruct the same identifier and load the same database records. Fresh transcript retrieval remains the factual evidence; previous AI answers do not become evidence.

## F. Persisted versus runtime-only state

| Persisted category | Purpose | Sensitive-data consideration |
|---|---|---|
| `messages` | Accumulated human/AI conversation | Exact questions and completed answers |
| `videoId`; scoped thread identifier | Bind and locate the conversation | Identifies video/conversation; not authentication |
| `question` | Preserve the current question | Exact user text |
| `retrievalQuery` | Contextualized retrieval input | Can include the preceding human question |
| `matches` | Current retrieved evidence | Transcript text, chunk indexes, timestamps, similarity |
| `answer` | Draft/validated/final answer during execution | Intermediate drafts can persist |
| `sources` | Citation validation results | Source IDs, chunk indexes, timestamps, similarity |
| `status` | Mark processing progress | Intermediate status does not prove a completed turn |
| Framework metadata/history/pending writes | Checkpoint bookkeeping and recorded execution | Task error names/messages can persist; error text is not automatically redacted |

Runtime-only values include callbacks, abort signals/controllers, HTTP objects, streams, database/model clients and functions. Closures and invocation-local storage retain those bindings; evidence/source projections admit only data fields. Credentials are not deliberately added to state, but arbitrary user/transcript/error text is not guaranteed secret-free. Keep the checkpoint schema outside exposed Data API schemas and restrict database access. Trace protections do not control database contents; Stage 5 adds no retention policy or encryption layer.

## G. Failure, retry and delivery semantics

Missing/invalid dedicated configuration fails clearly; there is no `DATABASE_URL` fallback. Failed initialization remains rejected for that runtime and attempts cleanup. Setup and cleanup failures produce non-zero exits. Read/write failures reject graph invocation; the controller sends its existing generic SSE error only while transport remains writable. Driver details are sanitized at the runtime boundary.

Cancellation or generation failure before finalization leaves no completed partial AI turn, although intermediate checkpoints/human messages may remain. Conversely, a fully completed checkpoint can commit before disconnect prevents `done`. A controller test demonstrates that state remains complete and retrying the same public conversation/question adds another AI turn. `conversationId` identifies a thread, not a request: no idempotency key, distributed transaction or exactly-once browser delivery exists. Silent memory fallback would falsely advertise durability, so it is deliberately absent.

## H. Guarantees and evidence

| Guarantee | Supporting evidence |
|---|---|
| Official PostgreSQL production persistence | Installed API/source review; resource construction; real integration |
| Shared initialization; no per-request pool/setup | `conversationalRagRuntime.test.js`; resource/runtime code |
| Missing config/failures do not activate memory | Configuration, setup, read/write and initialization unit tests |
| Owned resources close once; startup precedes listening | Runtime/resource and `backendPersistenceStartup.test.js`, including deferred initialization and timeout |
| Repeated setup succeeds | Explicit command executed twice against disposable PostgreSQL; both exit 0 |
| New runtime restores context and isolates IDs/videos | `langgraphPersistence.integration.test.js`: real saver/pools, fake retrieval/generation |
| Failed/cancelled generation does not complete a partial turn | Existing graph/controller tests plus reopened PostgreSQL state assertions |
| HTTP/SSE/citations/abstention/overlap remain compatible | Existing graph/controller/model/service tests; localhost HTTP test |
| State excludes injected runtime fields | Graph projections; real integration state-field/evidence assertions |
| Automatic tracing payload protections remain | Existing graph/model/controller observability assertions |
| Commit is distinct from browser receipt | New controller disconnect-after-final-write test; retry creates another turn |

Final focused run: **111/111 tests, 7 files passed**. Full backend run: **232 passed, 1 gated integration skipped; 18 files passed, 1 skipped**. Separately executed real PostgreSQL integration: **1/1 passed** earlier in this same implementation session; persistence production code and that integration test remained unchanged afterward. `git diff --check` passed.

## I. Limitations and unverified behavior

- Complete backend-process restart, browser/UI and deployed shutdown were not exercised.
- The configured remote database was not used; production endpoint/pooler compatibility is unverified. URL checks cannot establish an arbitrary proxy's mode.
- Startup verifies reads, not all future write permissions or availability.
- Overlap rejection remains process-local, without cross-process coordination.
- Retention/growth and scale performance were not measured; no retention deletion policy was added.
- Crashes/SIGKILL or shutdown timeout cannot guarantee graceful closure.

## J. Interview-ready explanation

Remember six facts: official saver; stable scoped identity; explicit setup; one owned pool; sensitive intermediate snapshots; commit is not delivery.

**90-second answer:**

“ByteLearn already had a conversational RAG graph, but its checkpoints lived in a singleton MemorySaver. Restarting Node erased context even if the browser still remembered the conversation ID. Stage 5 replaces that production saver with the official PostgreSQL implementation, leaving graph behavior unchanged. The controller hashes the video ID and conversation UUID into a stable thread ID, so a new runtime can locate the previous checkpoints.

The runtime owns one dedicated pool, shares initialization, and drains work before closing it. Database structures are prepared through an explicit repeatable setup command. Persistence failures are visible rather than secretly reverting to memory. Checkpoints include retrieved evidence and drafts as well as messages, so they need a documented sensitive-data boundary.

We verified this with real PostgreSQL: complete Q1, close the old runtime/pool, create new ones, and prove Q2 loaded Q1 while other conversations and videos stayed isolated. We also tested cancellation and disconnect behavior. A commit can succeed without the browser receiving done, so retries are not exactly once. Full deployed-process and browser verification remain separate.”

| Follow-up | Short answer |
|---|---|
| Why PostgreSQL? | ByteLearn already uses PostgreSQL; the official saver supplies checkpoint semantics without another service. |
| Why not Prisma message tables? | They would model product chat history, not replace framework checkpoints. |
| Does restart resume SSE? | No. State survives; the previous HTTP stream and executing model call do not. |
| Why explicit setup? | Schema changes are intentional; requests only read/write prepared structures. |
| What happens after a lost `done`? | The turn may already be committed; retry can add another turn. |

## K. Synthesis facts for the final project PDF

- **Accepted Stage 4 baseline/current HEAD:** `08b9ca91b9cfe256f2991b5f1d56cc8cc2325314`; Stage 5 remains uncommitted.
- **Added:** direct exact `@langchain/langgraph-checkpoint-postgres@1.0.5`; the only added package path is `node_modules/@langchain/langgraph-checkpoint-postgres`.
- **Dependency audit:** no changed existing versions, removed paths or existing-package metadata changes. Root metadata only adds the dependency; lockfile version stays 3. LangSmith remains `0.8.11`. Core `1.2.11`, LangGraph `1.4.13`, checkpoint `1.1.5`, pg `8.20.0`, pg-pool `3.13.0`, Prisma client/adapter `7.5.0` remain unchanged. Node `20.20.2`, npm `10.8.2`.
- **Files:** eight production/configuration files listed in C; nine test/helper files; this evidence document.
- **Results:** focused 111 passed; full suite 232 passed/1 skipped; real PostgreSQL 1 passed; sequential setup twice passed. Completed commands exited 0. No test warnings were emitted in final runs.
- **Commands:** `LANGGRAPH_TEST_DATABASE_CONFIRMED=false npm test --prefix Backend`; focused run adds `--` and the seven lifecycle/setup/graph/controller test paths. From Backend: `npm run langgraph:setup` twice; `LANGGRAPH_TEST_DATABASE_CONFIRMED=true npm test -- src/test/langgraphPersistence.integration.test.js`.
- **Configuration/design:** required `LANGGRAPH_DATABASE_URL`, no fallback; schema `bytelearn_langgraph`; default serializer; synchronous graph durability; separate owned pool; explicit setup/cleanup. Integration opt-in is an operator assertion, not proof of safety.
- **Live evidence:** disposable localhost-only PostgreSQL 16 container; unique test IDs, exact-thread cleanup, container stopped/removed. No remote/production data modified. This proves new-runtime/new-pool continuity, not complete backend-process restart.
- **Git/deployment:** index empty; all Stage 5 edits unstaged/untracked relative to baseline. No commit, push, deployment or Stage 6 work. Limitations are listed in I.
