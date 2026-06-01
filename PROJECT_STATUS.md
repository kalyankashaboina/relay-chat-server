# Relay Chat — Project Status

## ✅ What's Done (Both FE + BE)

### Backend (relay-chat-server)

| Item                                                            | Status |
| --------------------------------------------------------------- | ------ |
| Redis removed (config, subscriber, socket adapter)              | ✅     |
| BullMQ / queues removed                                         | ✅     |
| Worker process removed (Dockerfile.worker, worker.ts, workers/) | ✅     |
| Winston → Pino (pretty in dev, JSON in prod)                    | ✅     |
| Token utility — single swappable place for JWT sign/verify      | ✅     |
| Cookie-based auth middleware (reads relay_token cookie)         | ✅     |
| Socket auth via cookie (no Redis lookup)                        | ✅     |
| In-memory idempotency (HTTP + socket dedup)                     | ✅     |
| In-memory presence (online users, typing, call state)           | ✅     |
| Direct DB write in socket handler (no async queue)              | ✅     |
| Zero `any` types                                                | ✅     |
| Pino logger (FastAPI-style dev output)                          | ✅     |
| Swagger UI at `/docs` + `/docs.json` for Postman import         | ✅     |
| MongoDB compound indexes (Conversation, User, Message)          | ✅     |
| DB query optimisation — field projection, no N+1 in sidebar     | ✅     |
| `shared/constants/index.ts` — all magic values centralised      | ✅     |
| ESLint 0 errors                                                 | ✅     |
| TypeScript 0 errors                                             | ✅     |
| docker-compose.dev.yml updated (MongoDB only)                   | ✅     |
| CI/CD workflows updated (no worker image)                       | ✅     |
| README + CHANGELOG updated                                      | ✅     |

### Frontend (relay-chat)

| Item                                                                       | Status |
| -------------------------------------------------------------------------- | ------ |
| E2E / Playwright removed                                                   | ✅     |
| eventLogger removed                                                        | ✅     |
| debugUtils removed                                                         | ✅     |
| All `eventLogger.log()` calls removed from chatSlice + useChat             | ✅     |
| Zero `any` types                                                           | ✅     |
| TypeScript strict mode                                                     | ✅     |
| ESLint 0 errors                                                            | ✅     |
| No hardcoded URLs (all from env vars)                                      | ✅     |
| Socket connects via short-lived token from `/api/auth/socket-token`        | ✅     |
| Axios client with cookie-based auth                                        | ✅     |
| All socket event names from `config/index.ts` constants (no magic strings) | ✅     |
| README + CHANGELOG updated                                                 | ✅     |

## Features Shipped

| Feature                    | BE              | FE  |
| -------------------------- | --------------- | --- |
| Direct chat                | ✅              | ✅  |
| Group chat                 | ✅              | ✅  |
| Typing indicators          | ✅              | ✅  |
| Read receipts              | ✅              | ✅  |
| Message reactions          | ✅              | ✅  |
| Edit / delete messages     | ✅              | ✅  |
| Reply to message           | ✅              | ✅  |
| Forward message            | ✅              | ✅  |
| Star / pin messages        | ✅              | ✅  |
| Vanish mode                | ✅              | ✅  |
| Scheduled messages         | ✅              | ✅  |
| Media / file upload        | ✅              | ✅  |
| Voice messages             | —               | ✅  |
| Audio calls (WebRTC)       | ✅ (signalling) | ✅  |
| Video calls (WebRTC)       | ✅ (signalling) | ✅  |
| User search                | ✅              | ✅  |
| Message search (full-text) | ✅              | ✅  |
| Profile (avatar, bio)      | ✅              | ✅  |
| Privacy settings           | ✅              | ✅  |
| Notification settings      | ✅              | ✅  |
| Block / unblock users      | ✅              | —   |
| Google OAuth               | ✅              | ✅  |
| Forgot / reset password    | ✅              | ✅  |
| Dark / light theme         | —               | ✅  |
| Offline queue              | —               | ✅  |

## 🔴 Not Yet Done / Known Gaps

| Item                              | Notes                                                                                  |
| --------------------------------- | -------------------------------------------------------------------------------------- |
| TURN server for production WebRTC | Needs an actual TURN server URL in env                                                 |
| Email delivery                    | SMTP env vars required; no mock in dev                                                 |
| Cloudinary                        | Falls back to data-URL in dev — configure for prod                                     |
| Scheduled message delivery        | Currently stored but not auto-sent; needs a cron job or setInterval dispatch           |
| Multi-instance deployment         | In-memory presence/idempotency won't scale horizontally; add Redis adapter when needed |
| Push notifications                | Backend foundation present (notification prefs model); no push gateway implemented     |
| Block user in FE                  | API endpoint exists, FE UI not wired                                                   |
| Message mentions UI               | MentionInput component exists; @mention delivery not tracked on BE                     |
| i18n beyond en/es                 | Translation keys exist for both; more languages need key additions                     |

## API Docs

- **Swagger UI**: `http://localhost:4000/docs`
- **Postman import**: GET `http://localhost:4000/docs.json` → Import as OpenAPI 3.0
