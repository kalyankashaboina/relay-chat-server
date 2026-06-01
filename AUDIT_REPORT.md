# Relay Chat — Audit & Optimization Report

## Pipeline Status

| Check        | Backend     | Frontend    |
| ------------ | ----------- | ----------- |
| `type-check` | ✅ 0 errors | ✅ 0 errors |
| `lint`       | ✅ 0 errors | ✅ 0 errors |
| `build`      | ✅ passes   | ✅ passes   |

---

## 🔐 Security Issues Fixed

| #   | Issue                                                                                    | Fix                                                                             |
| --- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 1   | Cookie `secure: true` hardcoded — broke HTTP in dev                                      | `secure: isProd`, `sameSite: 'strict'` prod / `'lax'` dev, driven by `NODE_ENV` |
| 2   | `deleteAccount` hardcoded `'relay_token'` string                                         | Now uses `AUTH.COOKIE_NAME` constant everywhere                                 |
| 3   | Login timing attack — early return on unknown email allowed user enumeration             | Constant-time: always runs `bcrypt.compare` even when user not found            |
| 4   | Rate limiter applied **after** body validation — attacker could send huge payloads first | Moved rate limiter **before** `validate()` in all auth routes                   |
| 5   | No security headers                                                                      | Added `helmet` to Express setup                                                 |
| 6   | `changePassword` used `resetPasswordSchema.parse({ token: 'dummy', … })` hack            | Replaced with dedicated `newPasswordSchema` (Zod, reused from `authService`)    |
| 7   | Google auth returned wrong payload shape silently                                        | Added explicit `null` checks on `sub` + `email` before proceeding               |
| 8   | Forgot password email rolled back on send failure but user saw generic error             | Now rolls back token AND throws a clear "try again" error                       |

---

## 🐛 Bugs Fixed

| #   | Issue                                                                                                                               | Fix                                                                    |
| --- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 1   | Conversation cursor paginated by `_id` but sorted by `updatedAt` — wrong order                                                      | Cursor is now ISO date string, matches `{ updatedAt: -1 }` sort        |
| 2   | MongoDB compound text index `{ conversationId, content: 'text' }` — **invalid** (MongoDB only allows one text index per collection) | Removed compound text index; `{ content: 'text' }` only                |
| 3   | `uniqueUsername` looped up to 5 DB calls on collision                                                                               | Now: 1 check → if taken, append random 4-digit suffix (max 2 DB calls) |
| 4   | `authRepository.findByEmailOrUsername` with empty strings built invalid `$or`                                                       | Fixed: filters out empty string conditions before building `$or`       |
| 5   | `updateMe` in `user.controller` duplicated `auth.service.updateProfile` logic                                                       | `updateMe` now delegates to `updateProfile` — single source of truth   |
| 6   | `console.log` in `chatSlice.addOwnMessage` reducer (fires on every message)                                                         | Removed                                                                |
| 7   | `console.log` for call events with TODO comments (shipped to prod)                                                                  | Removed — call overlay handles its own state                           |
| 8   | `webrtcService` eagerly imported at app startup (blocks initial bundle parse)                                                       | Now dynamically imported when auth initializes                         |
| 9   | MessageBubble re-renders on every message list update                                                                               | Wrapped in `React.memo`                                                |
| 10  | ConversationItem re-renders on every sidebar update                                                                                 | Wrapped in `React.memo`                                                |

---

## ⚡ Performance Optimizations

### Backend — Database

| Optimization              | Before                                                                          | After                                                              |
| ------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Conversation sidebar load | `find() + .populate('participants') + .populate('lastMessage')` — 3 round trips | Single `$aggregate` pipeline with `$lookup` stages — 1 round trip  |
| Message pagination        | `find() + .populate('senderId')` — N+1 potential                                | `$aggregate` with `$lookup` sender join in pipeline — 1 round trip |
| Message search            | `find() + .populate('senderId')`                                                | `$aggregate` with text score sort + `$lookup` — 1 round trip       |
| Pinned messages           | `find() + .populate('senderId')`                                                | `$aggregate` with `$lookup` — 1 round trip                         |
| Conversation search       | `find()` across participant userIds then filter                                 | `$aggregate` with `$or` matching group names + participant IDs     |

### Backend — Indexes Added

| Collection      | Index                                       | Purpose                                             |
| --------------- | ------------------------------------------- | --------------------------------------------------- |
| `messages`      | `{ conversationId: 1, _id: -1 }`            | Cursor-based pagination (replaces `createdAt` sort) |
| `messages`      | `{ conversationId: 1, readBy: 1 }`          | Unread count queries                                |
| `messages`      | `{ conversationId: 1, isPinned: 1 }` sparse | Pinned message lookup                               |
| `messages`      | `{ starredBy: 1 }` sparse                   | Starred messages per user                           |
| `messages`      | `{ isScheduled: 1, scheduledAt: 1 }` sparse | Scheduled message dispatch                          |
| `conversations` | `{ participants: 1, updatedAt: -1 }`        | Sidebar load (participant filter + sort)            |
| `conversations` | `{ type: 1, participants: 1 }`              | Direct chat dedup lookup                            |
| `conversations` | `{ mutedBy: 1 }` sparse                     | Mute lookup                                         |
| `conversations` | `{ archivedBy: 1 }` sparse                  | Archive lookup                                      |
| `users`         | `{ googleId: 1 }` sparse                    | Google OAuth login lookup                           |
| `users`         | `{ passwordResetToken: 1 }` sparse          | Password reset (already existed, noted for audit)   |

### Frontend — React Performance

| Optimization                                   | Detail                                                                 |
| ---------------------------------------------- | ---------------------------------------------------------------------- |
| `React.memo` on `MessageBubble`                | Prevents re-render of all bubbles when new message arrives             |
| `React.memo` on `ConversationItem`             | Prevents full sidebar re-render on active conversation change          |
| `React.memo` on `MessageItem` in `MessageList` | Individual item isolation                                              |
| `useCallback` on `MessageInput` handlers       | `handleFileSelect`, `removeFile` stable references                     |
| `useCallback` on `ChatWindow` handlers         | `handleBack`, `handleLogout`, `handleNavigateToMessage`, call handlers |
| `webrtcService` lazy-loaded                    | Removed from startup bundle — only loaded on first auth init           |
| ChatWindow split into sub-components           | `ChatHeader`, `MessageList` extracted — ChatWindow: 617 → 140 lines    |

### Frontend — Code Splitting

| Route                    | Status            |
| ------------------------ | ----------------- |
| `/` (Index / ChatLayout) | `lazy()` ✅       |
| `/login`                 | `lazy()` ✅       |
| `/register`              | `lazy()` ✅       |
| `/forgot-password`       | `lazy()` ✅       |
| `webrtcService`          | Dynamic import ✅ |

---

## 🏗 Architecture / DRY / KISS

| Area                        | Issue                                                                           | Fix                                                                              |
| --------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Auth cookie options         | Spread across 3 files with inconsistent values                                  | Single `cookieOptions` const in `auth.controller.ts`                             |
| Profile update              | `user.controller.updateMe` + `auth.service.updateProfile` — two implementations | `updateMe` delegates to `updateProfile`                                          |
| Token operations            | JWT sign/verify scattered across files                                          | All in `shared/utils/token.ts` — one place to swap                               |
| Cookie name                 | `'relay_token'` hardcoded in 4 places                                           | `AUTH.COOKIE_NAME` constant throughout                                           |
| Google login                | No FE component — users couldn't use Google auth                                | `GoogleLoginButton` component + `GoogleOAuthProvider` in `App.tsx`               |
| `authService.ts`            | `mapUser` had `_id \|\| id` ambiguity + wrong error shape                       | Typed `ApiUser` interface, clean `toAuthUser` mapper                             |
| `authSlice.ts`              | Referenced `STORAGE_KEYS` (localStorage) — auth is cookie-based                 | Removed; Redux is the only state store                                           |
| Aggregation pipeline stages | Repeated `$lookup` blocks per repository method                                 | Extracted `participantsLookup`, `lastMessageLookup`, `sidebarPipeline` constants |

---

## 📁 Files Changed This Pass

### Backend

- `src/modules/auth/auth.controller.ts` — env-driven cookies, `AUTH.COOKIE_NAME`
- `src/modules/auth/auth.service.ts` — timing-safe login, fix `changePassword`, `findUniqueUsername`
- `src/modules/auth/auth.routes.ts` — rate limiter before validation
- `src/modules/auth/repository/auth.repository.ts` — clean `findByEmailOrUsername`
- `src/modules/conversations/repository/conversation.repository.ts` — full aggregation, no N+1
- `src/modules/messages/repository/message.repository.ts` — aggregation pipelines
- `src/modules/users/user.controller.ts` — removed duplicate `updateMe`, uses `AUTH.COOKIE_NAME`
- `src/modules/users/repository/user.repository.ts` — index-aware search query
- `src/modules/messages/message.model.ts` — 6 new indexes
- `src/modules/users/user.model.ts` — googleId sparse index
- `src/modules/conversations/conversation.model.ts` — mute/archive sparse indexes
- `src/modules/http/express.ts` — helmet, body size limits, proper CORS
- `src/shared/logger.ts` — pino wrapper with `toMeta` helper
- `tsconfig.json` — `ignoreDeprecations: "5.0"`

### Frontend

- `src/App.tsx` — `GoogleOAuthProvider`, lazy webrtcService
- `src/features/auth/authSlice.ts` — removed localStorage coupling
- `src/features/auth/authService.ts` — typed `ApiUser`, clean `toAuthUser`, error extraction
- `src/features/auth/components/GoogleLoginButton.tsx` — **new**
- `src/features/auth/pages/LoginPage.tsx` — Google button wired
- `src/features/chat/components/ChatWindow.tsx` — 617 → 140 lines
- `src/features/chat/components/ChatHeader.tsx` — **new** (extracted)
- `src/features/chat/components/MessageList.tsx` — **new** (extracted)
- `src/features/chat/components/MessageBubble.tsx` — `React.memo`
- `src/features/chat/components/ConversationList.tsx` — `React.memo` on item
- `src/features/chat/components/MessageInput.tsx` — `useCallback` on handlers
- `src/features/chat/chatSlice.ts` — removed console.logs, fixed thunks
- `src/features/chat/useChat.ts` — removed console.logs, fixed call handlers
- `src/config/index.ts` — added `GOOGLE_CLIENT_ID`

---

## 🔴 Known Gaps (Not In Scope / Need External Config)

| Gap                             | Notes                                                                                                             |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Scheduled message auto-dispatch | Messages stored but not sent automatically — needs a `setInterval` or cron job                                    |
| TURN server                     | WebRTC calls behind symmetric NAT will fail without a TURN server — set `TURN_SERVER` env vars                    |
| Push notifications              | Pref model exists, no push gateway implemented                                                                    |
| Multi-instance scaling          | In-memory presence/idempotency won't sync across multiple pods — add Redis adapter when horizontal scaling needed |
| Block user UI                   | `POST /api/users/:id/block` exists; no FE button wired outside ContactDetails                                     |
| Email verification flow         | `isEmailVerified` stored but no verification email sent on register (welcome email only)                          |
