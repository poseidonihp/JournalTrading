import { existsSync } from 'node:fs';
import path from 'node:path';
import { defineConfig } from '@prisma/config';

const envPath = path.join(__dirname, '.env');

// Prisma 7 ya no carga .env automáticamente; sin esto migrate/studio/seed se quedan
// sin DATABASE_URL. Si la variable ya viene del entorno, loadEnvFile no la sobreescribe.
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

// Prisma 7 ya no acepta `url` en el schema: la URL de migrate/studio vive acá.
// Este archivo reemplaza al removido `package.json#prisma`.
export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  datasource: {
    url: process.env['DATABASE_URL'] ?? '',
  },
  migrations: {
    seed: 'tsx prisma/seed.ts',
  },
});
