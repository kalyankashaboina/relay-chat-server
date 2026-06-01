# Relay Chat — Backend

Node.js + Express + Socket.IO + MongoDB backend for Relay Chat.

## Stack

| Layer      | Tech                                                 |
| ---------- | ---------------------------------------------------- |
| Runtime    | Node.js 20                                           |
| Framework  | Express 4                                            |
| Realtime   | Socket.IO 4                                          |
| Database   | MongoDB via Mongoose                                 |
| Auth       | JWT in HttpOnly cookie                               |
| Validation | Zod                                                  |
| Logging    | Pino (pretty in dev, JSON in prod)                   |
| Upload     | Multer + Cloudinary (local data-URL fallback in dev) |
| Docs       | Swagger UI at `/docs`                                |

## Features

- **Chat** — direct and group conversations (text, media, files)
- **Typing indicators** — auto-stop after 8 s of inactivity
- **Message status** — sent → delivered → read
- **Reactions** — add / remove emoji reactions
- **Edit & delete** — soft-delete, edit with history
- **Vanish mode** — timer-based message expiry
- **Scheduled messages** — create and list future messages
- **Media sharing** — Cloudinary upload (25 MB max)
- **Audio / video calls** — WebRTC signalling via Socket.IO
- **Profile** — avatar, bio, privacy settings
- **Search** — full-text message search, conversation search

## Quick Start

```bash
cp .env.example .env
# Edit .env — set MONGO_URI and JWT_SECRET at minimum

npm install
npm run dev
```

Dev server: `http://localhost:4000`  
Swagger docs: `http://localhost:4000/docs`  
Health: `http://localhost:4000/health`

## Scripts

| Command              | Purpose                     |
| -------------------- | --------------------------- |
| `npm run dev`        | Dev server with ts-node     |
| `npm run build`      | Compile TypeScript → dist/  |
| `npm start`          | Run compiled dist/server.js |
| `npm run lint`       | ESLint                      |
| `npm run format`     | Prettier                    |
| `npm run type-check` | tsc --noEmit                |
| `npm run seed`       | Seed DB with test data      |

## Docker (dev — MongoDB only)

```bash
docker compose -f docker-compose.dev.yml up -d
```

This starts MongoDB locally. The app itself runs via `npm run dev`.

## Environment Variables

See `.env.example` for all variables. Required in production:

- `MONGO_URI`
- `JWT_SECRET` (32+ chars)

## API

All routes are prefixed with `/api`. Cookie-based auth — set `withCredentials: true` on the client.

See **Swagger UI** at `/docs` for full spec, or import `docs.json` from `/docs.json`.

## Architecture

```
src/
├── config/          env, performance, swagger
├── db/              MongoDB connection
├── modules/
│   ├── auth/        register, login, Google OAuth, password reset
│   ├── conversations/ CRUD, group management, mute, archive
│   ├── messages/    paginated fetch, star, pin, forward, schedule, search
│   ├── socket/      Socket.IO event handlers (in-memory presence)
│   ├── upload/      Cloudinary / local fallback
│   └── users/       profile, privacy, notifications, block
└── shared/
    ├── constants/   single source of truth for all magic values
    ├── errors/      AppError class
    ├── middleware/   auth, errorHandler, idempotency, validate
    ├── services/    email, link-preview
    ├── utils/       token, logger helpers
    └── validators/  Zod schemas
```
