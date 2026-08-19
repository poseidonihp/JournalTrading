/**
 * Opciones de conexión de node-postgres compartidas por todos los PrismaClient del backend.
 */
export const pgSessionOptions = '-c timezone=UTC';

/**
 * Construye la config de pool para `PrismaPg` a partir de la URL de conexión.
 * @param {string | undefined} connectionString - URL de PostgreSQL
 * @returns {{ connectionString: string | undefined; options: string }}
 */
export function pgPoolConfig(connectionString: string | undefined): {
  connectionString: string | undefined;
  options: string;
} {
  return { connectionString, options: pgSessionOptions };
}
