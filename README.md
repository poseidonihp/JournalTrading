# Trading Journal

Journal de trading personal moderno para futuros (NinjaTrader). Stack: **Angular 21 + NestJS + PostgreSQL** en monorepo con pnpm + Turborepo.

Plan completo del proyecto: [journal.md](./journal.md).

## Pre-requisitos

- **Node.js 22+** (https://nodejs.org)
- **pnpm**: `npm install -g pnpm`
- **Git**
- **PostgreSQL 16** (se instala en Fase 2; en Fase 1 no es necesario)

## Estructura

```
journal/
├── apps/
│   ├── frontend/        Angular 21 (UI)
│   └── backend/         NestJS (API)
├── packages/
│   ├── shared-types/    Schemas Zod compartidos
│   └── config/          tsconfig / eslint / prettier base
├── storage/             Uploads locales (gitignored)
└── journal.md           Plan del proyecto
```

## Setup local

```bash
pnpm install
pnpm dev
```

- Frontend: http://localhost:4200
- Backend:  http://localhost:3000 (health: `/health`)

## Scripts

- `pnpm dev`    — Levanta backend + frontend en paralelo (Turborepo)
- `pnpm build`  — Build de todos los paquetes
- `pnpm lint`   — Lint de todos los paquetes
- `pnpm format` — Format con Prettier

## Roadmap

- **Fase 1** (actual) — Estructura del proyecto y scaffolds funcionando.
- **Fase 2** — Conectar PostgreSQL, schema Prisma, auth con JWT.
- **Fase 3** — CRUD de trades con UI completa, multi-cuenta, upload de imágenes/video, export CSV.
- **Fase 4** — Dashboard, calendario mensual, KPIs, importer CSV de NinjaTrader.
- **Fase 5** — NinjaScript Add-On (live), playbooks/setups, reportes.
- **Fase 6** — Deploy cloud (S3, dominio, multi-tenant).
