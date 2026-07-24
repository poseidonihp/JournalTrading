# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Personal trading journal for futures (NinjaTrader). Stack: Angular 21 + NestJS (Fastify) + PostgreSQL 16, in a pnpm + Turborepo monorepo. Local-first but cloud-ready (S3 driver planned).

The full multi-phase plan lives in [journal.md](./journal.md). Read it before scoping any non-trivial work — phases are explicit (Fase 1 = scaffolds; Fase 2 = DB+auth, current; Fase 3 = trade CRUD; etc.) and features are intentionally deferred.

## Commands

Run from repo root unless noted. Node 22+ and pnpm 9.15+ required.

| Task | Command |
| --- | --- |
| Install deps | `pnpm install` |
| Dev (both apps in parallel via Turbo) | `pnpm dev` |
| Build everything | `pnpm build` |
| Lint everything | `pnpm lint` |
| Format / check format | `pnpm format` / `pnpm format:check` |
| Backend only | `pnpm --filter @journal/backend dev` |
| Frontend only | `pnpm --filter @journal/frontend dev` |
| Backend tests (Vitest) | `pnpm --filter @journal/backend test` |
| Single backend test | `pnpm --filter @journal/backend exec vitest run path/to/file.spec.ts` |
| Frontend tests | `pnpm --filter @journal/frontend test` |
| Prisma migrate (dev) | `pnpm --filter @journal/backend prisma:migrate` |
| Prisma generate client | `pnpm --filter @journal/backend prisma:generate` |
| Prisma Studio | `pnpm --filter @journal/backend prisma:studio` |
| Seed DB | `pnpm --filter @journal/backend prisma:seed` |
| Reset DB (destructive) | `pnpm --filter @journal/backend db:reset` |

Frontend serves on `http://localhost:4200`, backend on `http://localhost:3000`. The Angular dev server proxies `/api` and `/health` to the backend (see [proxy.conf.json](apps/frontend/proxy.conf.json)), so frontend code should call relative paths, not `localhost:3000`.

## Architecture

### Monorepo layout
- [apps/backend](apps/backend/) — NestJS 10 with **Fastify** adapter (not Express). Prisma + PostgreSQL.
- [apps/frontend](apps/frontend/) — Angular 21 standalone, **zoneless**, Tailwind 4, Angular CDK, lucide-angular icons.
- [packages/shared-types](packages/shared-types/) — Zod schemas + inferred types shared between backend and frontend (`@journal/shared-types`, exported from `src/index.ts` directly as TS source).
- [packages/config](packages/config/) — `tsconfig-base.json` and `prettier-base.json` consumed by other packages.
- [storage/](storage/) — local uploads root (gitignored); will become S3-backed in Fase 6.

### Backend (NestJS + Fastify)
- Entry: [apps/backend/src/main.ts](apps/backend/src/main.ts). Sets global prefix `api` **except** for `health` and `health/db` (those stay at root so the frontend proxy routes them directly). CORS limited to `http://localhost:4200` with `credentials: true` because auth uses cookies.
- Env validated at boot with Zod in [config/env.validation.ts](apps/backend/src/config/env.validation.ts) — invalid env crashes startup with a readable error. Use `ConfigService<Env, true>` and `.get('KEY', { infer: true })` to keep types.
- **Auth model**: JWT in httpOnly cookies, **not** Authorization header (though the guard accepts `Bearer` too as a fallback). Two cookies issued by [auth.controller.ts](apps/backend/src/modules/auth/auth.controller.ts):
  - `journal_access` — path `/`, 15 min, contains access token.
  - `journal_refresh` — path `/api/auth`, 7 days, only sent to refresh/logout endpoints.
  - Cookie names are exported from [jwt.guard.ts](apps/backend/src/modules/auth/jwt.guard.ts) as `ACCESS_COOKIE` / `REFRESH_COOKIE`. Reuse those constants instead of hardcoding strings.
- **Global guard**: `JwtAuthGuard` is registered as `APP_GUARD` in [auth.module.ts](apps/backend/src/modules/auth/auth.module.ts), so **every endpoint requires auth by default**. Opt out with `@Public()` from [decorators/public.decorator.ts](apps/backend/src/modules/auth/decorators/public.decorator.ts) at the controller or method level. Get the user with `@CurrentUser()`.
- **Validation pattern**: Zod schemas live in `*.dto.ts` (or in `@journal/shared-types` when shared with the frontend) and are wired up via `@UsePipes(new ZodValidationPipe(Schema))` from [common/pipes/zod-validation.pipe.ts](apps/backend/src/common/pipes/zod-validation.pipe.ts). Don't pull in `class-validator` / `class-transformer` — this project standardizes on Zod end-to-end.
- **Prisma**: [PrismaService](apps/backend/src/prisma/prisma.service.ts) extends `PrismaClient` and connects in `onModuleInit`. Provided globally via [PrismaModule](apps/backend/src/prisma/prisma.module.ts). Inject `PrismaService` rather than instantiating `PrismaClient` ad-hoc. Schema field naming convention: camelCase in TS, snake_case in DB via `@map`/`@@map`.

### Frontend (Angular 21)
- Bootstrapped with `provideZonelessChangeDetection()` — no Zone.js. Always use signals / `OnPush` and avoid APIs that rely on zone-based change detection. See [app.config.ts](apps/frontend/src/app/app.config.ts).
- Standalone components only, lazy routes via `loadComponent` (see [app.routes.ts](apps/frontend/src/app/app.routes.ts)).
- Layout: `core/` (cross-cutting: layout shell, theme), `features/` (route-level features), `shared/` (planned, reusable UI). `App` root just renders `<app-shell />`.
- **Theme**: [ThemeService](apps/frontend/src/app/core/theme/theme.service.ts) toggles a `.dark` class on `<html>` and persists to `localStorage` under `journal:theme`. Tailwind 4 dark variants and CSS color-tokens hang off this class.
- HTTP uses `provideHttpClient(withFetch())`. Call same-origin paths (`/api/...`) — the dev proxy forwards them. Cookies are sent automatically; do not attach Authorization headers.

### Shared types (`@journal/shared-types`)
- Published as **raw TS source** (`main` and `exports` point at `src/index.ts`). The frontend and backend both consume it directly — no build step, no `dist/`. This is intentional; if you add files, re-export them from `src/index.ts`.
- When a contract is shared (request/response shapes, enums), define the Zod schema here once and infer the type. The backend imports the same schema for runtime validation; the frontend imports it for form/type safety.

## Engineering approach

**Think before coding.** State assumptions explicitly before implementing. If multiple interpretations exist, present them — don't pick silently. If something is unclear, stop and ask rather than guessing.

**Simplicity first.** Write the minimum code that solves the problem. No speculative features, no abstractions for single-use code, no flexibility that wasn't requested. If it could be 50 lines, don't write 200.

**Surgical changes.** Touch only what the request requires. Don't refactor adjacent code, don't "improve" unrelated formatting, match existing style even if you'd do it differently. If your changes orphan imports/variables, remove them. If you notice pre-existing dead code, mention it — don't delete it.

**Goal-driven execution.** For non-trivial tasks, state a brief plan with verifiable checkpoints before starting:
```
1. [step] → verify: [check]
2. [step] → verify: [check]
```
Transform vague tasks into concrete success criteria ("fix bug" → "write test that reproduces it, then make it pass").

## Code quality (non-negotiable)

- **Never use `any`.** If a type is genuinely unknown, use `unknown` and narrow it; for generics, constrain them. If you're tempted to reach for `any` to silence the compiler, that's a signal the model is wrong — fix the type, don't escape it. This applies to casts (`as any`), parameters, returns, and generics alike.
- **All code must comply with SonarQube rules** (Sonar way profile for TypeScript/Angular/NestJS). That means: no cognitive-complexity hotspots, no duplicated blocks, no dead code, no commented-out code, no empty catch blocks, no unused imports/variables, no nested ternaries, consistent return types, and explicit handling of every Promise. When in doubt, refactor for clarity over cleverness — Sonar flags clever code.

## Conventions worth knowing

- TypeScript is **strict**, including `noUncheckedIndexedAccess` and `noUnusedLocals/Parameters` (see [packages/config/tsconfig-base.json](packages/config/tsconfig-base.json)). Plan for `T | undefined` on every indexed access.
- Enums are stored in **English** (`LONG`, `SHORT`, `CONTINUATION`, `MISTAKE`, ...). Spanish is presentation-layer only — don't translate at the data layer. The full enum vocabulary is in [prisma/schema.prisma](apps/backend/prisma/schema.prisma) and [packages/shared-types/src/enums.ts](packages/shared-types/src/enums.ts).
- The Excel the user is migrating from is `excel.png` in the repo root — that screenshot is the source of truth for which columns the Trades table is expected to mirror in Fase 3.
- No Docker. PostgreSQL is installed natively on Windows; connection comes from `apps/backend/.env` (`DATABASE_URL`). `.env.example` lives inside `apps/backend/`, not at the repo root (the root `.env.example` is just a pointer).
- Comments and user-facing strings in this codebase are mostly in Spanish; match the surrounding language when editing a file.
