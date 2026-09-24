# ByteLearn

ByteLearn is a public video RAG tutor within a React/Express learning application.
It answers from video transcripts, supports short conversational follow-ups,
streams answers with timestamp citations, and persists backend conversation state
in PostgreSQL. It is a fixed workflow, not an autonomous agent.

The surrounding application includes video discovery/playback, S3 uploads and AWS
Transcribe preparation, accounts/roles, quizzes, progress, bookmarks, social
features and dashboards. Those subsystems stay outside the conversational graph.
Supermemory remains in legacy quiz code; public RAG does not use learner memory.
Stage 7 long-term learner personalization remains deferred.

## Developer entry points

- [Backend setup and dependency versions](Backend/README.md)
- [Frontend setup](Frontend/README.md)
- [Final architecture, ownership, decisions and limitations](Backend/BYTELEARN_V2_ARCHITECTURE_MAP.md)
- [Public answer API and SSE contract](Backend/API.md#embeddings--ai-qa)
- [Stage 9 acceptance ledger](Backend/docs/stage-9-acceptance.md)

Install and run from the separate `Backend/` and `Frontend/` directories; there
is no root package script. Backend setup requires both the product schema and
explicit LangGraph checkpoint setup before starting the server. See the linked
setup instructions for development database and provider prerequisites.

## Evidence boundary

**Stage 9 repository/integration acceptance: PASS.**
**Full live acceptance: NOT RUN.**

| Evidence | Result | Scope |
| --- | --- | --- |
| Stage 9 backend suite | 268 passed, 1 gated PostgreSQL skip | Unit/integration with fake infrastructure; anonymous loopback HTTP Q1/Q2 |
| Stage 9 frontend chat suite | 17 passed | jsdom/fake fetch; no real browser |
| Historical Stages 5/6 PostgreSQL checks | Recorded passes | Disposable local PostgreSQL, real saver/new pools, fake retrieval/generation; not a complete backend-process restart |
| Stage 9 real PostgreSQL, full process restart, real Gemini, actual-video journey, browser, development deployment | NOT RUN | Earlier checks do not fill these final live-acceptance gaps |
| Stage 10 | Documentation/static reconciliation plus one bounded S3 import repair | Stage 9 evidence reused; post-repair backend regression suite passed at 271 tests + 1 gated skip |

Historical [Stage 5](Backend/docs/stage-5-implementation-evidence.md),
[Stage 6](Backend/docs/stage-6-implementation-evidence.md),
[Stage 8](Backend/docs/stage-8-implementation-evidence.md) and
[Stage 9](Backend/docs/stage-9-acceptance.md) reports retain their original scope.
Stage 10 started from clean commit `eedc0e9` on 2026-09-24. That commit now contains
Stage 9; the report's uncommitted-worktree description is historical, not the
current git state.

During Stage 10 inspection, the S3 upload controller was found to reference the
canonical `PRIVATE_MEDIA_TYPES` set without importing it. The missing import was
added and a focused upload-controller regression test now covers anonymous avatar,
authenticated video, and rejected anonymous video requests. This repair is separate
from the conversational RAG architecture and did not change media policy.

The post-repair backend regression run passed **271 tests with 1 gated PostgreSQL
skip**. This later count must not be attributed retroactively to Stage 9.

## Retrieval and evaluation

The saved [dense baseline](Backend/evals/results/dense-baseline-v1.json) and
[hybrid RRF result](Backend/evals/results/hybrid-rrf-v2.json) cover **53 answerable
questions from a 61-question set** (8 unanswerable excluded from positive retrieval
metrics). Timestamp relevance uses temporal IoU >= 0.25.

| Historical metric | Dense | Hybrid |
| --- | ---: | ---: |
| Recall@5 | 88.1% | 91.2% |
| MRR@5 | 68.9% | 76.3% |

These are retrieval measurements from August 2026, not answer-quality scores or a
new evaluation of the final conversational release. [OpenEvals evaluator code](Backend/evals/semanticEvaluators.ts)
implements correctness, groundedness and citation-support judges plus deterministic
abstention/citation checks. The [semantic artifact](Backend/evals/results/final-semantic-eval-v1.json)
is **incomplete: 6/61, `complete: false`**. It supports no overall semantic-quality
claim. Stage 10 did not rerun either evaluation campaign.

## Demo instructions (not acceptance evidence)

Use an explicitly safe development installation with prepared transcript chunks,
working Gemini access and checkpoint tables. No specific live video is certified
by Stage 9; inspect the selected video's transcript first.

1. Select a playable video whose transcript actually supports your Q1.
2. Ask that supported Q1 in the video chat.
3. Observe answer fragments, then the completed answer and source chips.
4. Click a timestamp citation and check that the player seeks to that moment.
5. Ask a short contextual Q2 such as “Why?” only when the transcript supports it.
   Each turn retrieves fresh evidence; prior answer text is not evidence.
6. Optionally choose **New conversation** to abort pending work, replace the
   per-video ID and clear visible messages.
7. Ask a question unsupported by the video to exercise abstention. The API's
   canonical answer is `I couldn't find enough information in this video to answer that.`
   with `sources: []`; the UI displays “Not covered in this video”. Nonempty but
   irrelevant retrieval relies on model abstention instructions, so inspect the
   result rather than assuming every unsupported question takes the zero-hit branch.

These steps are a supported demonstration procedure, not a claim of live execution.

## Resume-safe wording

- Built a video-transcript RAG tutor using Gemini, PostgreSQL/pgvector, streamed
  answers and timestamp citations.
- Improved historical Recall@5 from 88.1% to 91.2% and MRR@5 from 68.9% to 76.3%
  with hybrid retrieval on 53 answerable questions from a 61-question benchmark.
- Implemented a LangGraph conversational workflow with PostgreSQL-backed
  checkpoints, fresh retrieval, evidence-based routing/abstention and a recent
  history limit of four completed human/AI pairs.
- Added selective LangSmith instrumentation and OpenEvals evaluator machinery;
  the recorded semantic evaluation remains incomplete at 6/61 examples.

| Claim | Implementation | Strongest evidence | Limitation |
| --- | --- | --- | --- |
| RAG tutor | Retriever, answer adapter/service, controller, React chat | Stage 9 anonymous HTTP Q1/Q2 and frontend tests | Fake provider/DB; real browser and actual-video acceptance not run; citations do not prove semantic support |
| Retrieval improvement | Dense + FTS + RRF services | Linked frozen complete retrieval artifacts | Only the stated population; not final conversational semantic evaluation |
| Conversation architecture | Graph/runtime/PostgresSaver | Stage 9 deterministic integration; historical Stages 5/6 real saver continuity | No full process-restart acceptance; four pairs are not a token limit; IDs are not authentication |
| Observability/evaluators | LangSmith wrapper and semanticEvaluators.ts | Stage 8/9 tracing tests; code and incomplete saved artifact | No completed semantic score or live telemetry acceptance; selected query text can be traced |

Public IDs are resume identifiers, same-thread overlap protection is process-local,
and delivery is not exactly once. Backend continuity does not restore old frontend
message bubbles or resume old HTTP streams. See the architecture's limitations
before making stronger claims about privacy, persistence or reliability.
