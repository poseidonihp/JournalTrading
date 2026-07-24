# Trading Journal — Plan de implementación

## Context

El usuario es trader de futuros con NinjaTrader que actualmente lleva su journal de trades en Excel. Quiere construir desde cero una aplicación web moderna (estilo TradeZella) que reemplace ese Excel y crezca con el tiempo: dashboard con KPIs, calendario mensual de P&L, adjuntar imágenes/videos por trade, eventual integración con NinjaTrader, modo claro/oscuro, y publicación web futura.

El objetivo final del producto es **registrar trades de forma cómoda y rápida**. El resto de features entran en fases posteriores. La arquitectura debe ser local-first pero cloud-ready para que la publicación web no requiera reescribir.

Directorio raíz: `C:\Users\juest\Desktop\journal` (vacío). Plataforma: Windows 11. PostgreSQL se instala nativo en Windows (sin Docker).

---

## Decisiones confirmadas con el usuario

- **Stack**: Angular 21 + NestJS + PostgreSQL.
- **UI library**: Tailwind CSS + Angular CDK + componentes headless propios. Sin PrimeNG, sin Material. Iconos con `lucide-angular`. Look custom estilo TradeZella.
- **Multi-cuenta**: selector de cuenta en la barra superior.
- **Long/Short**: campo `direction` se registra desde el inicio.
- **Moneda**: solo USD por ahora. Seed inicial: MES, MNQ, CFD genérico. Schema deja `currency` para sumar EUR si retoma Dax.
- **Auth desde día 1**: login email+password con seed user; preparado para multi-tenant futuro.
- **Sin Docker**: PostgreSQL nativo en Windows, conexión vía `DATABASE_URL`.
- **NinjaTrader**: enfoque por fases — primero importer CSV, luego NinjaScript Add-On en C#.

---

## Stack técnico

### Frontend (apps/frontend)
- **Angular 21** standalone, signals, zoneless, nuevo control flow, `inject()`, lazy routes, Reactive Forms tipados.
- **Tailwind CSS 4** con modo oscuro/claro (clase `.dark` persistida + signal global). CSS variables para tokens de color.
- **Angular CDK** (`@angular/cdk`): `overlay`, `a11y`, `drag-drop`, `scrolling` (virtual scroll), `clipboard`, `portal`.
- **lucide-angular** para iconos.
- **ECharts** vía `ngx-echarts` (Fase 4 en adelante).
- **State**: signals + signal stores propios.
- **HTTP**: wrapper sobre `HttpClient` + `resource()` API.
- **Testing**: Vitest + Playwright (e2e en Fase 4).

### Backend (apps/backend)
- **NestJS 11 con Fastify adapter**, Node 22 LTS, TypeScript estricto.
- **Prisma** ORM.
- **Validación**: Zod via `nestjs-zod` (compartido con frontend a través de `packages/shared-types`).
- **Auth**: JWT en cookie httpOnly + refresh token. `userId` en todas las tablas desde el inicio.
- **Storage abstraído**: `LocalDiskDriver` (escribe en `./storage/uploads/{userId}/{tradeId}/`); `S3Driver` en Fase 6.
- **Procesamiento media**: `sharp` para thumbnails. `ffmpeg-static` para keyframes de video más adelante.
- **WebSockets**: `@nestjs/websockets` cuando entre el live de NinjaTrader.

### Base de datos (instalación local nativa Windows, sin Docker)
- **PostgreSQL 16** con instalador oficial EDB (https://www.postgresql.org/download/windows/). pgAdmin incluido.
- Crear database `journal_dev` y user con password.
- Conexión vía `DATABASE_URL=postgresql://user:pass@localhost:5432/journal_dev` en `apps/backend/.env`.

### DevOps
- **pnpm workspaces** + **Turborepo**.
- `pnpm dev` levanta backend y frontend en paralelo.
- `.env.example` por app, validado al arrancar con Zod.

---

## Modelo de datos (referencia para Fase 2)

Enums almacenados en inglés (`CONTINUATION`, `BREAKOUT`, `TREND_REVERSAL`, `RANGE`, `OPENING`, `LONG`, `SHORT`, `TARGET`, `TRAILING_STOP`, `INITIAL_STOP`, `MANUAL`, `CONFIDENT`, `MISTAKE`, `PARAM_ERROR`, `EMOTIONAL_ERROR`). Traducción a español en presentación.

- **users**: id, email, password_hash, display_name, timezone, locale, created_at.
- **accounts**: id, user_id FK, name, broker, currency (default USD), initial_balance, is_active.
- **instruments**: id, symbol, name, category (FUTURE|CFD), point_value, default_commission_per_contract, tick_size, currency. Seed: MES (5, 1.22 USD), MNQ (2, 1.22 USD), CFD (1, 0.10 USD).
- **trades**: id, user_id, account_id, instrument_id, entered_at, exited_at, duration_seconds (generated), contracts, direction enum, trade_type enum, entry_reason text, exit_reason enum, emotion enum, points_total, point_value_snapshot, gross, commission, net, source enum (MANUAL|CSV|NINJATRADER), external_id (dedupe NT), notes, created_at, updated_at.
  - Cálculo automático: `gross = points_total * point_value_snapshot * contracts`; `net = gross - commission`. Override manual permitido.
- **trade_media**: id, trade_id, kind (IMAGE|VIDEO), path, thumbnail_path, mime, size_bytes, position.
- **tags** + **trade_tags** (M2M).
- **playbooks** (Fase 5).
- **sessions** (Fase 4).
- **import_batches** (Fase 4).

Vistas materializadas (Fase 4): `daily_pnl`, `monthly_pnl`, `kpi_summary`.

---

## Estructura de carpetas final

```
C:\Users\juest\Desktop\journal\
├── journal.md                 (este plan)
├── apps\
│   ├── frontend\              (Angular 21)
│   │   ├── src\app\
│   │   │   ├── core\          (auth, layout, theme, http)
│   │   │   ├── features\      (trades, accounts, auth)
│   │   │   └── shared\        (UI components, pipes)
│   │   ├── tailwind.config.ts
│   │   ├── postcss.config.js
│   │   └── proxy.conf.json
│   └── backend\               (NestJS)
│       ├── prisma\
│       │   ├── schema.prisma
│       │   ├── migrations\
│       │   └── seed.ts
│       └── src\
│           ├── modules\       (auth, users, accounts, instruments, trades, trade-media)
│           ├── common\        (guards, interceptors, filters)
│           ├── storage\       (LocalDiskDriver, S3Driver)
│           └── main.ts
├── packages\
│   ├── shared-types\          (Zod schemas compartidos)
│   └── config\                (eslint, tsconfig base, prettier)
├── storage\                   (uploads locales, en .gitignore)
├── .env.example
├── pnpm-workspace.yaml
├── turbo.json
├── package.json
├── .gitignore
├── .editorconfig
└── README.md
```

---

## Roadmap por fases

- **Fase 1 — Estructura del proyecto**: monorepo inicializado, scaffolds Angular y NestJS funcionando vacíos, Tailwind + CDK configurados, packages compartidos. Al final: `pnpm dev` levanta ambos servidores. **Sin DB conectada todavía. Sin features.**
- **Fase 2 — Conectar la base de datos**: instalar Postgres local, configurar `.env`, schema Prisma completo (users, accounts, instruments, trades, trade_media, tags), primera migration, seed de instrumentos y user de desarrollo, módulo de auth con JWT funcional, endpoint `/health/db` que verifica conexión. **Sin UI de trades aún.**
- **Fase 3 — Registrar trades**: módulos NestJS de accounts, instruments, trades, trade-media. UI Angular: shell con sidebar + topbar (selector de cuenta + toggle dark/light), pantalla de trades con tabla virtualizada, diálogo de New/Edit Trade con todos los campos y upload de imágenes/video, drawer de detalle, export CSV. **MVP completo del journal.**
- **Fase 4 — Insights**: dashboard con KPIs (Net P&L, Profit Factor, Win Rate, Expectancy, Avg win/loss), calendario mensual estilo TradeZella, equity curve, filtros avanzados, tags, importer CSV de NinjaTrader, sessions/daily journal con notas markdown.
- **Fase 5 — Live & Playbooks**: NinjaScript Add-On en C# que postea trades a `/api/ingest/ninjatrader` con HMAC; broadcast por WebSocket; catálogo de playbooks/setups con stats por estrategia; reportes avanzados (drawdown, MAE/MFE).
- **Fase 6 — Cloud**: deploy (Fly.io / Railway / VPS), driver S3-compatible, dominio, backups, multi-tenant real, posible PWA.

---

## Fase 1 — Pasos detallados

### Pre-requisitos a instalar manualmente (lo hace el usuario antes de empezar)
- Node.js 22 LTS desde nodejs.org.
- pnpm: `npm install -g pnpm`.
- Git.
- (Postgres se instala en Fase 2, no aquí.)

### Tareas de Fase 1

1. **Inicializar el repo**:
   - `git init` en `C:\Users\juest\Desktop\journal\`.
   - `.gitignore` (node_modules, dist, .env, storage, .turbo, .angular, *.tsbuildinfo).
   - `.editorconfig` y `.prettierrc` con reglas base.

2. **Monorepo**:
   - `package.json` raíz con `"private": true`, `"packageManager": "pnpm@..."`, scripts (`dev`, `build`, `lint`, `format`).
   - `pnpm-workspace.yaml` apuntando a `apps/*` y `packages/*`.
   - `turbo.json` con pipelines `dev` (persistent), `build`, `lint`.

3. **Paquete compartido `packages/config`**:
   - `tsconfig-base.json`, `eslint-base.cjs`, `prettier-base.json`. Frontend y backend extienden estos.

4. **Paquete `packages/shared-types`**:
   - `package.json` con name `@journal/shared-types`.
   - `src/index.ts` exportando `{}` (vacío, se llenará en Fase 2).
   - `tsconfig.json` extendiendo el base.

5. **Scaffold backend (`apps/backend`)**:
   - `nest new backend --package-manager pnpm --strict` desde `apps/`.
   - Cambiar adapter a Fastify (`@nestjs/platform-fastify`).
   - Añadir `@nestjs/config` y validación con Zod del `.env` al arrancar (sin `DATABASE_URL` aún, eso es Fase 2).
   - Endpoint `/health` que responda `{ status: 'ok' }`.
   - `.env.example`: `PORT=3000`, `JWT_SECRET=` (placeholder).

6. **Scaffold frontend (`apps/frontend`)**:
   - `ng new frontend --standalone --style=css --routing --strict --ssr=false` desde `apps/`.
   - Configurar zoneless: `provideExperimentalZonelessChangeDetection()` en `app.config.ts`.
   - Instalar y configurar Tailwind 4 (`@tailwindcss/postcss`, `tailwind.config.ts`, importar en `styles.css`).
   - Instalar `@angular/cdk` y `lucide-angular`.
   - Configurar dark mode con clase `.dark` y CSS variables base (background, foreground, primary, muted).
   - Crear estructura de carpetas con `.gitkeep`: `core/`, `features/`, `shared/`.
   - `app.component` con un layout mínimo (sidebar placeholder + main vacío) que demuestre Tailwind y modo oscuro funcionando con un toggle. Iconos lucide visibles.
   - `proxy.conf.json` con `/api` → `http://localhost:3000`.

7. **README.md**:
   - Pre-requisitos.
   - Pasos para clonar, instalar (`pnpm install`), arrancar (`pnpm dev`).
   - Estructura de carpetas y filosofía del repo.
   - Nota: Postgres y configuración de `.env` se hacen en Fase 2.

### Verificación end-to-end de Fase 1
1. `node -v` ≥ 22 y `pnpm -v` instalado.
2. `pnpm install` desde la raíz se completa sin errores.
3. `pnpm --filter backend start:dev` arranca, `curl http://localhost:3000/health` devuelve `{"status":"ok"}`.
4. `pnpm --filter frontend start` arranca en `:4200`, página carga, toggle de modo claro/oscuro funciona y persiste tras refrescar.
5. `pnpm dev` desde la raíz levanta los dos en paralelo (turborepo).
6. Tailwind aplica clases utility visiblemente. Iconos lucide renderizan.
7. `pnpm lint` corre en ambos apps sin errores.

---

## Fase 2 — Conectar la base de datos (resumen)

1. Instalar PostgreSQL 16 nativo en Windows (instalador EDB). Crear database `journal_dev` y user. Anotar credenciales.
2. Configurar `apps/backend/.env` con `DATABASE_URL`.
3. Añadir Prisma: `pnpm add -D prisma`, `pnpm add @prisma/client`, `pnpm prisma init`.
4. Escribir `prisma/schema.prisma` completo con todos los modelos (users, accounts, instruments, trades, trade_media, tags, trade_tags). Enums en inglés.
5. `pnpm prisma migrate dev --name init`.
6. `prisma/seed.ts`: instrumentos (MES, MNQ, CFD), 1 user de desarrollo, 1 account ejemplo.
7. Módulo `auth` en NestJS: login, logout, refresh, guard JWT global con bypass para `/auth/*` y `/health/*`.
8. Endpoint `/health/db` que ejecuta `SELECT 1` para verificar conexión.
9. En `packages/shared-types`: schemas Zod básicos de User, Account, Instrument.
10. Verificación: login con seed user funciona, `/health/db` retorna ok, `pnpm prisma studio` muestra los datos.

---

## Fase 3 — Registrar trades (resumen)

### Backend
- Módulos: `accounts`, `instruments`, `trades`, `trade-media`.
- Endpoints REST:
  - `GET/POST/PATCH/DELETE /accounts`
  - `GET /instruments`
  - `GET /trades` con filtros (mes, account_id, instrument_id, trade_type, emotion, direction) + paginación
  - `POST /trades` (cálculo automático de gross/net/duration; permite override manual)
  - `PATCH /trades/:id`, `DELETE /trades/:id`
  - `POST /trades/:id/media` (multipart, valida tamaño/mime, genera thumbnail con sharp)
  - `DELETE /trades/:id/media/:mediaId`
  - `GET /trades/export.csv` (clon del Excel actual)
- Schemas Zod compartidos en `packages/shared-types`.

### Frontend
- Shell: sidebar (Dashboard placeholder, **Trades** activo, Notebook placeholder, Playbooks placeholder), topbar con selector de cuenta + toggle dark/light + avatar.
- Pantalla **Trades**:
  - DataTable virtualizada (CDK virtual scroll) con columnas equivalentes al Excel (Mes, Producto, Contratos, Día, Hora, Duración, Tipo, Entrada, Salida, Emoción, Dirección, Puntos, Bruto, Comisión, Neto, Acumulado).
  - Filtros por mes, instrumento, tipo de trade, emoción, dirección.
  - Botón "Add Trade" abre diálogo (CDK overlay).
- Diálogo **New/Edit Trade**:
  - Form reactivo con todos los campos (incluyendo Long/Short).
  - Cálculo en vivo de gross/net.
  - Uploader drag-and-drop (CDK drag-drop) de imágenes y video con preview en grid.
- Detalle de trade: drawer lateral con galería (lightbox para imágenes, player nativo para video) y notas.
- Export CSV.

### Verificación
- Crear trade manual MES, 1 contrato, Long, +5 puntos, $1.22 comisión: `gross = 25`, `net = 23.78`.
- Adjuntar 2 imágenes y 1 video, verlas en detalle.
- Editar trade, verificar recálculo automático.
- Filtrar por mes y por instrumento.
- Export CSV iguala columnas del Excel actual.
- Cambiar de cuenta en topbar filtra los trades.

---

## Pendientes a confirmar más adelante

- Net override manual (form en Fase 3 con checkbox).
- Editor markdown para notas (textarea simple en Fase 3, Tiptap en Fase 4).
- Zona horaria del usuario configurable (UTC en BD, render en TZ del perfil).
- MAE/MFE, R-multiple, stop inicial en puntos para analytics avanzados (Fase 4).
- Mapeo de columnas del CSV de NinjaTrader (cuando se exporte uno real, Fase 4).

---

## Auditoría y mejoras propuestas (2026-05-23)

Auditoría completa del monorepo (backend NestJS+Fastify+Prisma, frontend Angular 21 zoneless, paquetes compartidos e infra). El proyecto está entre Fase 2 (auth/DB) y Fase 3 (CRUD de trades) — gran parte del CRUD ya existe en frontend y backend, pero hay **huecos importantes en seguridad, observabilidad, UX y tooling** que conviene cerrar antes de seguir añadiendo features.

### 🔴 Prioridad ALTA — Seguridad

#### 1. Endurecer cabeceras HTTP y rate limiting
- **Falta `helmet`** en el backend (no aparece en `apps/backend/package.json`). Sin HSTS, CSP, X-Frame-Options, etc.
- **Sin rate limiting**: el endpoint `POST /api/auth/login` está expuesto a fuerza bruta. Añadir `@nestjs/throttler` con límites estrictos en login/refresh y globales más laxos.
- **Sin CSP en `apps/frontend/src/index.html`** — añadir CSP `default-src 'self'` con excepciones controladas.

Archivos: `apps/backend/src/main.ts`, `apps/backend/src/app.module.ts`, `apps/frontend/src/index.html`.

#### 2. Rotación y revocación de refresh tokens
En `apps/backend/src/modules/auth/auth.controller.ts` el endpoint `refresh` emite tokens nuevos pero **no invalida el anterior** → replay attack si se filtra.
- Tabla `RefreshToken` con `jti`, `userId`, `revokedAt`, `replacedById` (rotación).
- Validar en `refresh` que el jti esté activo; revocar el anterior y emitir nuevo.
- `logout` que revoque toda la familia ante sospecha de robo.
- **Secretos separados** para access/refresh (hoy comparten `JWT_SECRET` en `auth.service.ts:78-85`).

#### 3. CSRF / cookies
- `sameSite` está hardcoded a `'lax'` (`auth.controller.ts:88`). Para mutaciones críticas, considerar **double-submit token** o `sameSite: 'strict'` y hacer ambos configurables por entorno.
- En `apps/backend/src/config/env.validation.ts`: **obligar** `COOKIE_SECURE=true` cuando `NODE_ENV=production`.
- CORS hardcodea `http://localhost:4200` (`main.ts:49`) — leer de env `CORS_ORIGINS` separado por comas.

#### 4. Filtro global de excepciones + sanitización de errores
- No existe `ExceptionFilter` global → en producción pueden filtrarse stacks/mensajes de Prisma. Crear `HttpExceptionFilter` que loguee con contexto pero responda sólo `{ message, code, requestId }`.
- `GET /health/db` devuelve mensajes crudos de Prisma (`health.controller.ts:29-34`) — sanitizar.
- `ZodValidationPipe` (`zod-validation.pipe.ts:10-16`) expone toda la estructura del schema — considerar formato más compacto en prod.

#### 5. Auditoría y dependencias
- Activar **Dependabot** o **Renovate** (`.github/dependabot.yml`) — no hay nada en `.github/`.
- Añadir `pnpm audit --prod` al CI.

### 🟠 Prioridad ALTA — Observabilidad y robustez backend

#### 6. Logger estructurado + correlation IDs
Hoy `new Logger(...)` por módulo (ej. `crypto.service.ts:14`), sin formato JSON ni request-id. Migrar a **`nestjs-pino`** con:
- Generación automática de `x-request-id` por petición.
- Redacción de campos sensibles (`password`, `Authorization`, cookies, `encryptedPassword`).
- Propagación del request-id al filtro de excepciones.

#### 7. Health checks completos y graceful shutdown
- Reemplazar `health.controller.ts` ad-hoc por **`@nestjs/terminus`** con checks `db`, `storage` (disk space), `memory`.
- Habilitar `app.enableShutdownHooks()` en `main.ts` y verificar que Fastify drena conexiones antes de cerrar Prisma.

#### 8. Tests
`vitest` está en deps pero **no hay archivos `.spec.ts`**. Como mínimo:
- `auth.service` (login, refresh, password mismatch, expired token).
- `crypto.service` (RSA decrypt happy path + payload inválido).
- Prisma decimal helpers en cálculos de `gross/commission/net`.
- E2E con `supertest` para el flujo cookie-based login → /me → refresh → logout.

#### 9. Prisma: índices y consistencia
Revisar `apps/backend/prisma/schema.prisma`:
- Índice a `Session.date` (lookups diarios).
- Índice a `Account.dataFeeNextChargeAt` (jobs de cobro).
- **Soft delete** (`deletedAt`) en `Trade` y `Account` por auditoría.
- Renombrar variable `const any = ...` en `imports.service.ts` (nombre confuso aunque no es `any` real).

### 🟡 Prioridad MEDIA — Frontend (UX / visualización)

#### 10. Sistema de notificaciones (toasts)
No hay feedback visual tras mutaciones (crear/editar/borrar trade). Implementar `NotificationService` con signals + componente overlay (Angular CDK Overlay ya disponible). Cablear en interceptores y stores.

#### 11. Skeletons y empty states unificados
Los `@if loading()` muestran spinners simples. Componentes reutilizables:
- `<journal-skeleton-table>` y `<journal-skeleton-card>` con animación shimmer.
- `<journal-empty-state>` con icono, copy y CTA (sin trades, filtros vacíos, sin cuentas).

#### 12. Accesibilidad
- Migrar grids de divs a `<table>` semántica con `<caption>` / `scope` (trades, accounts, instruments).
- Focus trap en CDK dialogs y restaurar foco al cerrar.
- Etiquetar todos los botones-solo-icono con `aria-label` (auditoría: ~38 ARIA atributos en toda la app — bajo).
- Verificar contraste AA de los tokens de color emocional en `trades.page.ts:260-290`.

#### 13. Responsive móvil
La sidebar (`app-shell`) tiene ancho fijo 232px. Breakpoint `md:` con drawer colapsable (Angular CDK). Probar formularios y tablas en viewports <768px.

#### 14. Limpieza de subscripciones RxJS
- `form.valueChanges.subscribe(...)` en `trade-form-dialog.component.ts:166` sin `takeUntilDestroyed()` → posible fuga si el diálogo se reabre muchas veces.
- Auditar otros `.subscribe()` y migrar a `toSignal()` / `takeUntilDestroyed()`.

#### 15. Charts — preparar Fase 4 con ECharts
Los SVG custom (`equity-curve.component.ts:59-135`) no escalan a candlesticks, MAE/MFE scatter, distribuciones, etc. Introducir **ngx-echarts** ya en Fase 3.5 con un wrapper `<journal-chart>` que abstraiga themes claro/oscuro.

#### 16. Refresh-token loop & cache HTTP
- En `auth-refresh.interceptor.ts` la cabecera `X-Retry-After-Refresh` es informal — usar también un contador local máx-1 por petición.
- No hay invalidación de cache global tras mutaciones; cada página recarga manualmente. Considerar un `EntityStore` ligero o **TanStack Query Angular** si el grafo crece.

### 🟡 Prioridad MEDIA — Tooling y DX

#### 17. CI/CD en GitHub Actions
Crear `.github/workflows/ci.yml`:
- `pnpm install --frozen-lockfile`
- `pnpm lint && pnpm format:check`
- `pnpm --filter @journal/backend test`
- `pnpm build` (validación Turbo)
- `pnpm audit --prod`

#### 18. Husky + lint-staged + commitlint
- Pre-commit: `prettier --write` + `eslint --fix` sobre staged.
- Commit-msg: `@commitlint/config-conventional`.

#### 19. ESLint compartido en `packages/config`
Hoy sólo hay `tsconfig-base.json` y `prettier-base.json`. Añadir `eslint-base.cjs` con reglas SonarJS (`eslint-plugin-sonarjs`) que cumplan la directriz del CLAUDE.md ("no `any`, Sonar way").

#### 20. Turbo
Añadir tareas `format`, `format:check`, `typecheck` al pipeline para cache + paralelización. Declarar `outputs: ["dist/**", "*.tsbuildinfo"]` en `build` para mejor caching.

#### 21. Repo hygiene
- `.vscode/extensions.json` con: ESLint, Prettier, Angular Language Service, Prisma, Tailwind CSS IntelliSense.
- `CONTRIBUTING.md` corto con convenciones (Zod-first, sin `any`, español en UI / inglés en datos, ramas).
- `LICENSE` (decidir: privada vs MIT).
- `.env.example` raíz con todas las variables reales, no sólo el puntero.

### 🟢 Prioridad BAJA — Mejoras futuras

- **2FA / TOTP** para el login (journal personal pero contiene PnL → razonable).
- **Audit log** en una tabla aparte para login, cambios de balance, borrados.
- **Rotación de claves RSA** sin reinicio (versión `kid` en el payload encriptado).
- **OpenAPI/Swagger** expuesto también en prod tras auth (hoy sólo dev — `main.ts:65`).
- **Bulk ops** en trades (delete, tag masivo, export filtrado).
- **Filtros avanzados** (rango PnL, duración, combo win/loss, instrumento, sesión).
- **Markdown editor** para `Session.notes` (deferido en roadmap).
- **PWA / offline** para registrar trades sin conexión y sincronizar.

### Archivos críticos del primer paso recomendado (seguridad+observabilidad, puntos 1-7)

1. `apps/backend/package.json` — añadir `helmet`, `@nestjs/throttler`, `nestjs-pino`, `pino-http`, `@nestjs/terminus`.
2. `apps/backend/src/main.ts` — registrar helmet, logger pino, shutdown hooks, CORS desde env.
3. `apps/backend/src/app.module.ts` — `ThrottlerModule`, `TerminusModule`, `APP_FILTER` global.
4. `apps/backend/src/common/` — nuevo `http-exception.filter.ts` + `request-id.middleware.ts`.
5. `apps/backend/src/config/env.validation.ts` — refinar (`CORS_ORIGINS`, `COOKIE_SECURE` obligatorio en prod, `REFRESH_JWT_SECRET`).
6. `apps/backend/prisma/schema.prisma` — modelo `RefreshToken` + migración.
7. `apps/backend/src/modules/auth/auth.service.ts` y `auth.controller.ts` — rotación con jti.
8. `.github/workflows/ci.yml` — nuevo.
9. `.github/dependabot.yml` — nuevo.

### Verificación end-to-end propuesta

- `pnpm --filter @journal/backend test` — suite nueva pasa.
- `curl` a `/api/auth/login` 11 veces → 429 (throttler).
- Inspeccionar respuesta: headers `helmet` presentes (HSTS, X-Content-Type-Options, etc.).
- Login → robar cookie → simular `refresh` con jti revocado → 401.
- `pnpm dev` + DevTools → toasts al crear/editar trade.
- Lighthouse a11y >90 en `/trades` y `/dashboard`.
- CI verde en PR de prueba.
