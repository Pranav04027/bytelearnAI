# ByteLearn frontend

React 19 + Vite application for video discovery/playback, transcript chat, quizzes,
accounts and learning workflows. The backend is the sibling [Backend](../Backend)
directory in this repository.

## Local setup

Use a Node version satisfying the checked-in Vite/Prisma engine ranges; the
[backend dependency table](../Backend/README.md#dependencies-and-versions) records
Node 20.20.2 / npm 10.8.2 at the reconciliation snapshot.

From `Frontend/`:

```bash
npm ci
npm run dev
```

Complete [backend setup](../Backend/README.md#development-setup) in a separate
terminal first. In development, leaving `VITE_API_BASE_URL` unset uses `/api/v1`
and the Vite proxy to `http://localhost:8000`. If `.env` already sets it, that value
overrides the proxy path. For a direct backend origin, set:

```env
VITE_API_BASE_URL=http://localhost:8000/api/v1
```

The base must include `/api/v1`. For a production build configure the real API
base explicitly: the current unset production fallback is
`http://localhost:3000/api/v1`, not the default backend port. Match backend CORS to
the frontend origin. `VITE_QUIZ_ATTEMPT_LIMIT` is an optional separate quiz setting
(template value 2); `VITE_APP_NAME` is a template placeholder, not chat configuration.
Never put Gemini/database/API secrets in browser environment variables.

Scripts: `npm run build` creates the Vite bundle; `npm run preview` serves a built
bundle locally; `npm run lint` runs ESLint; `npm test` runs Vitest.

## Public video chat

`src/pages/Videos/VideoDetail.jsx` hosts the player and desktop panel/mobile drawer.
`src/components/VideoChatBody.jsx` handles anonymous POST/SSE chat, progressive text,
final timestamp chips, errors and **New conversation**. The request includes
`videoId`, trimmed `question` and a per-video UUID saved in `sessionStorage`.

The UUID resumes backend state; it is not login or authenticated ownership. Reset
aborts pending requests before replacing the ID and clearing visible messages.
Returning to a video can reuse its stored ID. Reload/unmount does not restore old
message bubbles from PostgreSQL. Backend continuity, frontend visible history and
old stream resumption are separate concepts.

See [frontend architecture](docs/architecture.md), the
[public API](../Backend/API.md#embeddings--ai-qa), and the
[demo procedure](../README.md#demo-instructions-not-acceptance-evidence).
Stage 9's **17 passing chat tests** use jsdom/fake fetch; real browser, media seek
and actual-video/Gemini acceptance were **NOT RUN**. Stage 10 did not rerun tests
or change frontend behavior.
