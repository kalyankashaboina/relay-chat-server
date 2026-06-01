# Changelog

## [2.0.0] — 2025-06

### Removed

- **Redis** — all `ioredis` / `redis` usage removed (config, subscriber, socket adapter)
- **BullMQ** — message queue removed; messages are written directly to MongoDB in socket events
- **Worker process** — `Dockerfile.worker`, `src/worker.ts`, `src/workers/` deleted
- **Bull queue files** — `src/queues/` deleted
- **Winston** — replaced with Pino
- **`any` types** — zero `any` types remain across all source files

### Added

- **Pino logger** — human-readable (FastAPI-style) in dev, JSON in prod
- **Swagger UI** — full OpenAPI 3.0 spec at `/docs`, exportable at `/docs.json`
- **Token utility** (`shared/utils/token.ts`) — single place to swap auth strategy
- **In-memory idempotency** — deduplicates HTTP and socket messages without Redis
- **In-memory presence** — online users, typing timeouts, active calls (single-instance)
- **MongoDB indexes** — compound indexes added to Conversation and User models

### Changed

- **Socket auth** — reads `relay_token` cookie via `cookie` package (no Redis lookup)
- **Message delivery** — direct DB write in socket handler (was async queue → processor)
- **`docker-compose.dev.yml`** — MongoDB only (Redis service removed)
- **CI workflows** — worker image build/deploy removed
- **Constants** — `shared/constants/index.ts` is single source of truth for all magic values

### Fixed

- N+1 query risk in sidebar: uses `.populate()` with field projection
- Conversation model missing compound indexes (`participants + updatedAt`)
- User model missing `passwordResetToken` sparse index and `username` text index
