# Plan de despliegue — Trading Journal en producción (Windows nativo + Cloudflare Tunnel)

## Contexto

El proyecto (Angular 21 SPA + NestJS/Fastify + PostgreSQL 16, monorepo pnpm/Turbo) está listo para
desarrollo local pero **no tiene ninguna infraestructura de despliegue** (cero Dockerfiles, cero
reverse proxy, cero CI de deploy, ni script de migración de producción). El objetivo es publicarlo en
el mini PC casero (donde ya corren Sonarr/Prowlarr) bajo `journal.poseidonihp.com`, exponiéndolo con el
**Cloudflare Tunnel** que ya usas.

Decisiones tomadas contigo:
- **Runtime**: Windows nativo, sin Docker (aprovecha Postgres nativo + el `binaryTarget "windows"` que ya tiene Prisma).
- **Ingress**: Cloudflare Tunnel (un hostname nuevo).
- **Datos**: migrar solo la base de datos (pg_dump/restore); uploads desde cero.
- **URL**: `journal.poseidonihp.com` (subdominio → same-origin trivial).

### Restricciones del código que condicionan el diseño
- La SPA usa rutas **relativas** (`/api`, `/health`, `/uploads`) y su `index.html` fija `connect-src 'self'`
  → **SPA y API deben servirse desde el mismo origen**. El backend **no** sirve la SPA.
  → Necesitamos un reverse proxy que sirva los estáticos de Angular y reenvíe `/api`, `/health`, `/uploads` al backend.
- En `NODE_ENV=production` el backend **se niega a arrancar si `COOKIE_SECURE≠true`** (exige HTTPS). Cloudflare
  termina TLS en el borde, así que el navegador ve HTTPS y las cookies `Secure` funcionan aunque nginx→backend sea HTTP.
- Same-origin ⇒ `COOKIE_SAMESITE=lax` y `COOKIE_DOMAIN` vacío bastan; CORS deja de ser relevante.

## Arquitectura objetivo

```
Navegador (HTTPS journal.poseidonihp.com)
  └─► Cloudflare (TLS en el borde)
       └─► cloudflared (servicio Windows, saliente — no abre puertos)
            └─► nginx para Windows  :8080
                 ├─ /            → estáticos SPA (apps/frontend/dist/frontend/browser) + fallback index.html
                 └─ /api /health /uploads → proxy_pass http://127.0.0.1:3000
                      └─► backend Node (node dist/main.js) 127.0.0.1:3000
                           ├─► PostgreSQL 16 (127.0.0.1:5432, DB journal_prod)
                           └─► uploads en disco (STORAGE_ROOT, p.ej. D:\journal\storage\uploads)
```
`cloudflared`, `nginx` y el backend Node se instalan como **servicios de Windows** (via NSSM) para que
arranquen solos con el equipo.

## Parte A — Cambios en el repositorio (lo único que se edita en código)

Mínimos y quirúrgicos:

1. **`apps/backend/package.json`** — añadir script de migración de producción:
   ```json
   "prisma:deploy": "prisma migrate deploy",
   ```
   (Hoy solo existe `prisma migrate dev`, que **no** debe usarse en prod.)

2. **`deploy/nginx-journal.conf`** (archivo nuevo, versionado) — server block del reverse proxy:
   ```nginx
   server {
       listen 8080;
       server_name journal.poseidonihp.com;
       client_max_body_size 260m;            # uploads hasta 250MB (ojo: Cloudflare free corta en 100MB)

       root C:/journal/apps/frontend/dist/frontend/browser;   # ajustar a la ruta real del repo
       index index.html;

       proxy_set_header Host              $host;
       proxy_set_header X-Real-IP         $remote_addr;
       proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
       proxy_set_header X-Forwarded-Proto https;
       proxy_read_timeout 300s;

       location / { try_files $uri $uri/ /index.html; }       # rutas del router → SPA
       location /api/      { proxy_pass http://127.0.0.1:3000; }
       location = /health  { proxy_pass http://127.0.0.1:3000; }
       location /health/db { proxy_pass http://127.0.0.1:3000; }
       location /uploads/  { proxy_pass http://127.0.0.1:3000; }
   }
   ```

3. **`apps/backend/.env.production.example`** (archivo nuevo) — plantilla de env de prod documentando
   todas las variables incluida `STORAGE_ROOT` (que hoy no está en `.env.example`). El `.env` real se crea
   en el mini PC y **no** se commitea (ya está gitignoreado).

4. **`DEPLOY.md`** (archivo nuevo) — el runbook de la Parte B, para que sea repetible.

> **No** hace falta tocar `schema.prisma` (el `binaryTarget "windows"` ya está) ni `main.ts` (nginx resuelve
> el same-origin, sin código extra). Se mantiene el principio de cambios quirúrgicos.

## Parte B — Runbook de despliegue en el mini PC (Windows)

### B0. Prerrequisitos a instalar en el mini PC
- **Node 22+** y **pnpm 9.15.0** (`corepack enable` o `npm i -g pnpm@9.15.0`).
- **Git** (para clonar el repo).
- **PostgreSQL 16 para Windows** (instalador EDB).
- **nginx para Windows** (zip oficial, extraer p.ej. a `C:\nginx`).
- **NSSM** (para registrar servicios) — https://nssm.cc.
- **cloudflared** ya está (ejecutas el túnel).

### B1. Llevar el código al mini PC
⚠️ El repo **no tiene commits todavía** (todos los archivos están sin trackear). Primero:
- En la máquina de desarrollo: crear repo **privado** en GitHub, `git add -A`, commit inicial, `git push`.
  (Los `.env` están gitignoreados → los secretos no se suben.)
- En el mini PC: `git clone` del repo privado. *(Alternativa sin git: robocopy de la carpeta excluyendo
  `node_modules`, `dist`, `.angular`.)*

### B2. Instalar dependencias y compilar (en el mini PC)
```powershell
pnpm install --frozen-lockfile
pnpm --filter @journal/backend prisma:generate     # genera el client de Prisma (binaryTarget windows)
pnpm build                                          # turbo: shared-types → backend → frontend
```
Produce: `packages/shared-types/dist`, `apps/backend/dist/main.js`, `apps/frontend/dist/frontend/browser/`.

### B3. Base de datos (migrar solo la DB)
1. En **desarrollo** (esta máquina), volcar la DB actual:
   ```powershell
   pg_dump -Fc -h localhost -U postgres -d journal_dev -f journal.dump
   ```
2. Copiar `journal.dump` al mini PC.
3. En el **mini PC**: crear rol/DB y restaurar (el dump incluye `_prisma_migrations`, así que queda al día):
   ```powershell
   psql -U postgres -c "CREATE DATABASE journal_prod;"
   pg_restore -h localhost -U postgres -d journal_prod --no-owner journal.dump
   ```
4. Confirmar el estado de migraciones (debe ser no-op):
   ```powershell
   pnpm --filter @journal/backend prisma:deploy
   ```
   *(Postgres/backend deben escuchar solo en `localhost`; no hacen falta puertos abiertos.)*

### B4. Crear el `.env` de producción
En `apps/backend/.env` (el backend lo carga desde su CWD; el servicio debe correr con AppDirectory=`apps/backend`).
Generar secretos **nuevos** (no reutilizar los de dev):
```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"   # JWT_SECRET
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"   # JWT_REFRESH_SECRET
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"   # COOKIE_SECRET
pnpm --filter @journal/backend gen:rsa                                     # RSA_PRIVATE_KEY_B64
```
Contenido del `.env`:
```
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://postgres:TU_PASSWORD@localhost:5432/journal_prod
JWT_SECRET=<generado>
JWT_REFRESH_SECRET=<generado, distinto>
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=7d
COOKIE_SECRET=<generado>
COOKIE_DOMAIN=
COOKIE_SECURE=true            # OBLIGATORIO en prod
COOKIE_SAMESITE=lax           # same-origin, suficiente
CORS_ORIGINS=https://journal.poseidonihp.com
RSA_PRIVATE_KEY_B64=<generado>
STORAGE_ROOT=D:\journal\storage\uploads
```
Crear la carpeta de `STORAGE_ROOT` (vacía; uploads desde cero).

### B5. Registrar servicios de Windows (NSSM)
1. **Backend**:
   ```powershell
   nssm install journal-backend "C:\Program Files\nodejs\node.exe" "C:\journal\apps\backend\dist\main.js"
   nssm set journal-backend AppDirectory "C:\journal\apps\backend"
   nssm start journal-backend
   ```
2. **nginx** (colocar `deploy/nginx-journal.conf` como `conf/servers/journal.conf` incluido desde `nginx.conf`):
   ```powershell
   nssm install journal-nginx "C:\nginx\nginx.exe" "-p" "C:\nginx"
   nssm start journal-nginx
   ```
   Verificar local: `curl http://localhost:8080/health` debe responder OK.

### B6. Cloudflare Tunnel → hostname público
En **Zero Trust → Networks → Tunnels → (tu túnel) → Public Hostnames → Add**:
- Subdomain: `journal`, Domain: `poseidonihp.com`
- Type: `HTTP`, URL: `localhost:8080`

Cloudflare crea el CNAME automáticamente. *(Si tu túnel usa `config.yml`, añadir la ingress rule
`hostname: journal.poseidonihp.com → service: http://localhost:8080` antes del `service: http_status:404`
final.)* SSL/TLS del sitio en modo **Full**. Universal SSL cubre `journal.poseidonihp.com`.

Opcional (recomendado como capa extra): **Cloudflare Access** para permitir solo tu correo.

## Verificación (end-to-end)
1. `https://journal.poseidonihp.com/health` y `/health/db` responden OK a través de Cloudflare.
2. Carga la SPA; el login funciona (fetch de `/api/auth/public-key`, cifra password, recibe cookie).
3. DevTools → Application → Cookies: `journal_access` con `Secure`, `HttpOnly`, `SameSite=Lax`,
   dominio `journal.poseidonihp.com`, path `/`.
4. Se ven los **trades migrados** (confirma que la DB llegó bien).
5. Sube una imagen pequeña a un trade y verifica que se sirve desde `/uploads/...`.
6. Reinicia el mini PC y confirma que los 3 servicios (postgres, journal-backend, journal-nginx, cloudflared)
   arrancan solos.

## Notas y advertencias
- ⚠️ **Límite de subida de Cloudflare (plan free): 100 MB.** El backend acepta hasta 250 MB, pero archivos
  >100 MB fallarán a través del túnel. Para screenshots de trades no es problema; para vídeos largos sí.
- Los secretos de prod deben ser **nuevos** y distintos de los de dev.
- `cloudflared` es saliente: **no** se abre ningún puerto en el router; backend y Postgres quedan solo en localhost.
- El proxy manda `X-Forwarded-*`, pero Fastify no tiene `trustProxy` configurado → el rate-limit verá la IP
  del proxy. Irrelevante para un journal de un solo usuario; se puede endurecer luego si hace falta.
- Actualizaciones futuras: `git pull` → `pnpm install` → `pnpm build` → `pnpm --filter @journal/backend prisma:deploy`
  → `nssm restart journal-backend` (y recargar nginx si cambiaron estáticos).
