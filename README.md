# ByteLearn

ByteLearn is a full-stack AI-enhanced learning platform built around video-first education. It combines a YouTube-style course experience with personalized learning features such as transcript-aware Q&A, AI-generated quizzes, progress tracking, recommendations, and role-based dashboards for learners and instructors.

The project was designed to go beyond simple video hosting. The goal is to make learning sessions interactive, measurable, and adaptive to each student.

## Recruiter Snapshot

ByteLearn is the kind of project that demonstrates product thinking, backend depth, and practical AI integration in one system.

- Built a production-style full-stack platform, not a toy demo
- Designed and implemented an end-to-end learning workflow across upload, playback, assessment, and personalization
- Integrated AWS media infrastructure, PostgreSQL/Prisma, authentication, analytics, and AI features into one cohesive product
- Shipped applied AI features that are tied to user value: transcript Q&A, semantic retrieval, learner memory, and AI-generated quizzes

If you want a single project that shows I can build across frontend, backend, database design, cloud services, and AI workflows, this is that project.

## What It Does

Most learning platforms stop at content delivery. ByteLearn focuses on the layer after playback:

- helping learners ask questions against the exact video transcript
- generating quizzes from lesson content
- tracking progress across sessions
- surfacing personalized recommendations based on engagement
- preserving learner context with memory-driven AI features

This makes the platform closer to an intelligent learning environment than a standard video portal.

## Core Features

### Learner Experience

- Browse and watch educational videos with secure playback URLs
- Continue watching from saved progress
- Bookmark videos and manage likes
- Comment on lessons and engage socially
- Follow creators through subscriptions
- Get personalized recommendations based on completed and bookmarked content
- Attempt quizzes tied to individual videos
- Ask natural-language questions about a video using transcript-aware AI

### Instructor Experience

- Upload videos with S3-backed media handling
- Manage published and draft content
- Access instructor dashboard analytics
- Review channel performance, watch trends, and likes by video
- Attach assessments to lessons

### AI and Intelligence Layer

- Automatic transcription pipeline using AWS Transcribe
- Transcript chunking and semantic embeddings
- Video-specific question answering using vector similarity search
- AI-generated quizzes derived from transcript context
- Learner memory integration via Supermemory for more personalized responses and quiz generation

## Technical Highlights

- Monorepo structure with separate `Frontend` and `Backend` apps
- Secure private video delivery using presigned S3 URLs
- Role-based access for learners and instructors
- PostgreSQL + Prisma data model
- Express API with modular routes/controllers
- React SPA with protected routes and dashboard views
- AI workflow that connects transcription, embeddings, retrieval, and quiz generation into one learning loop

## Engineering Scope

This project demonstrates ownership across the full stack:

- Frontend application architecture with protected routes, dashboards, and video-centric UX
- Backend API design with modular controllers, middleware, and role-based authorization
- Relational schema design for users, videos, progress, quizzes, subscriptions, and social features
- Cloud media workflow using S3 presigned uploads and secure playback access
- AI pipeline design using transcription, chunking, embeddings, retrieval, and generation
- Personalization through learner memory and engagement-based recommendations

## Tech Stack

### Frontend

- React 19
- React Router
- Vite
- Axios
- Tailwind CSS

### Backend

- Node.js
- Express 5
- Prisma ORM
- PostgreSQL
- JWT authentication
- AWS S3
- AWS Transcribe

### AI / Personalization

- Google Gemini
- LangChain text splitters
- pgvector-style embedding storage in PostgreSQL
- Supermemory

## Architecture Overview

1. Instructors upload video and thumbnail assets using presigned S3 upload URLs.
2. Video metadata is stored in PostgreSQL through Prisma.
3. AWS Transcribe processes uploaded video audio.
4. Completed transcripts are saved and chunked into embedding-ready segments.
5. Learners can ask questions against the transcript, and the backend retrieves the most relevant chunks before generating an answer.
6. The same transcript context can be used to generate AI quizzes for the lesson.
7. Learner interactions such as quiz performance and question patterns can be stored as memory to personalize future assistance.

## Repository Structure

```text
ByteLearn/
├── Backend/
│   ├── prisma/
│   └── src/
│       ├── controllers/
│       ├── routes/
│       ├── middlewares/
│       └── utils/
├── Frontend/
│   └── src/
│       ├── api/
│       ├── components/
│       ├── pages/
│       └── routes/
└── README.md
```

## Notable Modules

- `Backend/src/controllers/video.controllers.js`
  Handles publishing, playback access, and lifecycle operations for video content.
- `Backend/src/controllers/embedding.controllers.js`
  Powers transcript chunking, embeddings, and transcript-aware AI Q&A.
- `Backend/src/controllers/quiz.controllers.js`
  Supports quiz creation, AI quiz generation, submission, and scoring.
- `Backend/src/utils/transcriptionPolling.js`
  Polls transcription jobs and triggers embedding creation after completion.
- `Frontend/src/pages/Videos/VideoDetail.jsx`
  Central lesson experience with playback, comments, AI chat, and quiz access.

## Local Setup

### Prerequisites

- Node.js 20+
- PostgreSQL
- AWS account with S3 and Transcribe access
- Gemini API access
- Supermemory API key

### 1. Clone the repository

```bash
git clone <your-repo-url>
cd ByteLearn
```

### 2. Install dependencies

Backend:

```bash
cd Backend
npm install
```

Frontend:

```bash
cd ../Frontend
npm install
```

### 3. Configure environment variables

Create `Backend/.env` with the following values:

```env
PORT=8000
NODE_ENV=development
DATABASE_URL=
CORS_ORIGIN=

ACCESS_TOKEN_SECRET=
ACCESS_TOKEN_EXPIRY=
REFRESH_TOKEN_SECRET=
REFRESH_TOKEN_EXPIRY=

AWS_REGION=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
S3_BUCKET_NAME=
S3_PUBLIC_BASE_URL=

GEMINI_API_KEY=
SUPERMEMORY_API_KEY=

INTERNAL_API_BASE_URL=http://127.0.0.1:8000
```

You will also need the frontend API base URL configured to point at the backend instance if your local setup uses a custom port or proxy arrangement.

### 4. Initialize the database

```bash
cd Backend
npm run db:generate
npm run db:push
```

### 5. Start the backend

```bash
cd Backend
npm run dev
```

### 6. Start the frontend

```bash
cd Frontend
npm run dev
```

## Available Scripts

### Backend

- `npm run dev` - start backend in watch mode
- `npm start` - start backend normally
- `npm run test` - run backend tests
- `npm run db:generate` - generate Prisma client
- `npm run db:push` - push schema to database
- `npm run db:studio` - open Prisma Studio

### Frontend

- `npm run dev` - start Vite development server
- `npm run build` - build production bundle
- `npm run lint` - run ESLint
- `npm run preview` - preview production build

## API Surface

The backend exposes modular REST endpoints under `/api/v1`, including:

- `/users` for authentication and profile management
- `/videos` for publishing, playback, and discovery
- `/comments`, `/likes`, `/bookmarks`, `/subscriptions`, `/playlists`
- `/progress` for watch tracking and continue-watching
- `/recommendations` for personalized content suggestions
- `/quizzes` for quiz generation, retrieval, and submission
- `/embeddings` for transcript embeddings and AI Q&A
- `/awsS3` for presigned media upload and secure playback helpers

## Why This Stands Out

ByteLearn showcases practical full-stack engineering across product, infrastructure, and AI integration:

- building a non-trivial multi-role application from end to end
- designing a relational schema for content, engagement, and assessments
- integrating cloud storage and media workflows
- implementing authentication and protected client routing
- connecting LLM workflows to a real product surface instead of isolated demos
- using retrieval and learner memory to personalize educational interactions

For recruiter review, the main signal is breadth with cohesion: the project is not a collection of disconnected features. The AI layer, analytics, video infrastructure, and user workflows all support the same learning product.

## Future Enhancements

- stronger automated test coverage across frontend and backend
- background job queue for long-running AI and transcription workflows
- richer analytics for instructor performance insights
- multi-attempt quiz analytics and learner skill maps
- deployment configuration for production environments

## Author

**Pranav Chauhan**

If you are using this project as a portfolio piece, add:

- a hosted demo link
- architecture diagrams
- screenshots or a short walkthrough GIF
- a short section on engineering decisions and tradeoffs
