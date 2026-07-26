/**
 * Script de mantenimiento (uso puntual, no forma parte del runtime).
 *
 * Mueve TODOS los datos de un usuario origen a un usuario destino, borra el
 * usuario origen y opcionalmente crea un usuario administrador.
 *
 * Pensado para consolidar el usuario semilla `dev@journal.local` en la cuenta
 * real después de un despliegue. Por defecto sólo simula (dry-run): hay que
 * pasar `--apply` para escribir en la base.
 *
 * Uso:
 *   tsx scripts/merge-user.ts --to juestalrod@outlook.com
 *   tsx scripts/merge-user.ts --to juestalrod@outlook.com --apply
 *   ADMIN_PASSWORD=... tsx scripts/merge-user.ts --to juestalrod@outlook.com \
 *     --create-admin admin@journal.local --admin-name 'Admin' --apply
 *
 * Flags:
 *   --from <email>          Usuario origen (default: dev@journal.local)
 *   --to <email>            Usuario destino (obligatorio)
 *   --create-admin <email>  Crea además este usuario; password en ADMIN_PASSWORD
 *   --admin-name <nombre>   displayName del admin (default: Admin)
 *   --apply                 Ejecuta los cambios (sin este flag no escribe nada)
 */
import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

const defaultSourceEmail = 'dev@journal.local';
const defaultAdminName = 'Admin';
const bcryptRounds = 12;
const minPasswordLength = 8;
const labelPadding = 26;

interface ICliOptions {
  fromEmail: string;
  toEmail: string;
  adminEmail: string | null;
  adminName: string;
  apply: boolean;
}

interface IUserRef {
  id: string;
  email: string;
}

interface IOwnedName {
  userId: string;
  name: string;
}

interface IConflict {
  table: string;
  names: string[];
}

interface IAdminInput {
  email: string;
  displayName: string;
  password: string;
}

/**
 * Escribe una línea en stdout (SonarQube S106 veta `console.log`).
 * @param {string} text - Texto a imprimir
 * @returns {void}
 */
function printLine(text: string): void {
  process.stdout.write(`${text}\n`);
}

/**
 * Escribe una línea en stderr.
 * @param {string} text - Texto a imprimir
 * @returns {void}
 */
function printError(text: string): void {
  process.stderr.write(`${text}\n`);
}

/**
 * Separa los argumentos en pares flag/valor. Los flags booleanos quedan con
 * cadena vacía como valor.
 * @param {string[]} argv - Argumentos crudos
 * @returns {Map<string, string>} Flags encontrados
 */
function collectFlags(argv: string[]): Map<string, string> {
  const flags = new Map<string, string>();
  let index = 0;
  while (index < argv.length) {
    const token = argv[index] ?? '';
    if (token.startsWith('--')) {
      const next = argv[index + 1];
      const hasValue = next !== undefined && !next.startsWith('--');
      flags.set(token, hasValue ? next : '');
      index += hasValue ? 2 : 1;
    } else {
      index += 1;
    }
  }
  return flags;
}

/**
 * Lee un flag con valor, tratando la cadena vacía como ausencia.
 * @param {Map<string, string>} flags - Flags parseados
 * @param {string} name - Nombre del flag (incluye `--`)
 * @returns {string | null} Valor del flag o null
 */
function readFlag(flags: Map<string, string>, name: string): string | null {
  const value = flags.get(name);
  return value === undefined || value === '' ? null : value;
}

/**
 * Parsea los argumentos de línea de comandos del script.
 * @param {string[]} argv - Argumentos crudos (sin node ni el path del script)
 * @returns {ICliOptions} Opciones normalizadas
 */
function parseArgs(argv: string[]): ICliOptions {
  const flags = collectFlags(argv);
  const toEmail = readFlag(flags, '--to');
  if (toEmail === null) {
    throw new Error('Falta --to <email> (usuario destino)');
  }
  const fromEmail = readFlag(flags, '--from') ?? defaultSourceEmail;
  const adminEmail = readFlag(flags, '--create-admin');
  const adminName = readFlag(flags, '--admin-name') ?? defaultAdminName;
  const apply = flags.has('--apply');
  return { fromEmail, toEmail, adminEmail, adminName, apply };
}

/**
 * Busca un usuario por email y falla si no existe.
 * @param {string} email - Email del usuario
 * @returns {Promise<IUserRef>} Referencia al usuario
 */
async function requireUser(email: string): Promise<IUserRef> {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true },
  });
  if (user === null) {
    throw new Error(`No existe ningún usuario con email ${email}`);
  }
  return user;
}

/**
 * Devuelve los nombres que ya existen en el usuario destino y colisionarían
 * con los del origen (tablas con unique compuesto de usuario + nombre).
 * @param {IOwnedName[]} rows - Filas de ambos usuarios
 * @param {string} sourceId - Id del usuario origen
 * @param {string} targetId - Id del usuario destino
 * @returns {string[]} Nombres duplicados
 */
function duplicatedNames(rows: IOwnedName[], sourceId: string, targetId: string): string[] {
  const sourceNames = new Set(rows.filter((row) => row.userId === sourceId).map((row) => row.name));
  return rows
    .filter((row) => row.userId === targetId && sourceNames.has(row.name))
    .map((row) => row.name);
}

/**
 * Detecta colisiones de unicidad que harían fallar la reasignación.
 * @param {string} sourceId - Id del usuario origen
 * @param {string} targetId - Id del usuario destino
 * @returns {Promise<IConflict[]>} Conflictos encontrados por tabla
 */
async function findConflicts(sourceId: string, targetId: string): Promise<IConflict[]> {
  const where = { userId: { in: [sourceId, targetId] } };
  const select = { userId: true, name: true } as const;

  const [accounts, tradeTypes, trackerAccounts, sessions] = await Promise.all([
    prisma.account.findMany({ where, select }),
    prisma.tradeType.findMany({ where, select }),
    prisma.trackerAccount.findMany({ where, select }),
    prisma.session.findMany({ where, select: { userId: true, date: true } }),
  ]);

  const sessionDates = sessions.map((session) => ({
    userId: session.userId,
    name: session.date.toISOString(),
  }));

  return [
    { table: 'accounts', names: duplicatedNames(accounts, sourceId, targetId) },
    { table: 'trade_types', names: duplicatedNames(tradeTypes, sourceId, targetId) },
    { table: 'tracker_accounts', names: duplicatedNames(trackerAccounts, sourceId, targetId) },
    { table: 'sessions (fecha)', names: duplicatedNames(sessionDates, sourceId, targetId) },
  ].filter((conflict) => conflict.names.length > 0);
}

/**
 * Imprime los conflictos detectados y aborta el script si hay alguno.
 * @param {IConflict[]} conflicts - Conflictos encontrados
 * @returns {void}
 */
function abortOnConflicts(conflicts: IConflict[]): void {
  if (conflicts.length === 0) {
    return;
  }
  for (const conflict of conflicts) {
    printError(`✗ ${conflict.table}: nombres repetidos → ${conflict.names.join(', ')}`);
  }
  throw new Error(
    'El destino ya tiene registros con los mismos nombres. Renombrá o borrá esos registros en el destino y volvé a correr el script.',
  );
}

/**
 * Cuenta las filas del usuario origen que se van a reasignar.
 * @param {string} sourceId - Id del usuario origen
 * @returns {Promise<[string, number][]>} Pares tabla/cantidad
 */
async function countOwnedRows(sourceId: string): Promise<[string, number][]> {
  const where = { userId: sourceId };
  const [accounts, tradeTypes, trackerAccounts, trades, sessions, importBatches, media] =
    await Promise.all([
      prisma.account.count({ where }),
      prisma.tradeType.count({ where }),
      prisma.trackerAccount.count({ where }),
      prisma.trade.count({ where }),
      prisma.session.count({ where }),
      prisma.importBatch.count({ where }),
      prisma.tradeMedia.count({ where: { trade: { userId: sourceId } } }),
    ]);

  return [
    ['accounts', accounts],
    ['trade_types', tradeTypes],
    ['tracker_accounts', trackerAccounts],
    ['trades', trades],
    ['sessions', sessions],
    ['import_batches', importBatches],
    ['trade_media (vía trades)', media],
  ];
}

/**
 * Reasigna los datos del usuario origen al destino y borra el origen.
 * @param {string} sourceId - Id del usuario origen
 * @param {string} targetId - Id del usuario destino
 * @returns {Promise<void>}
 */
async function moveAndDelete(sourceId: string, targetId: string): Promise<void> {
  const where = { userId: sourceId };
  const data = { userId: targetId };

  await prisma.$transaction(async (tx) => {
    await tx.account.updateMany({ where, data });
    await tx.tradeType.updateMany({ where, data });
    await tx.trackerAccount.updateMany({ where, data });
    await tx.trade.updateMany({ where, data });
    await tx.session.updateMany({ where, data });
    await tx.importBatch.updateMany({ where, data });
    // Los refresh_tokens del origen NO se mueven: caen por cascade al borrarlo,
    // invalidando cualquier sesión abierta con ese usuario.
    await tx.user.delete({ where: { id: sourceId } });
  });
}

/**
 * Valida los datos del futuro admin (email libre y password suficiente).
 * @param {string} email - Email del futuro admin
 * @param {string} displayName - Nombre visible del futuro admin
 * @returns {Promise<IAdminInput>} Datos listos para crear el usuario
 */
async function validateAdminInput(email: string, displayName: string): Promise<IAdminInput> {
  const password = process.env.ADMIN_PASSWORD ?? '';
  if (password.length < minPasswordLength) {
    throw new Error(
      `ADMIN_PASSWORD es obligatoria y debe tener al menos ${minPasswordLength} caracteres`,
    );
  }
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing !== null) {
    throw new Error(`Ya existe un usuario con email ${email}`);
  }
  return { email, displayName, password };
}

/**
 * Crea el usuario administrador.
 * @param {IAdminInput} admin - Datos validados del admin
 * @returns {Promise<void>}
 */
async function createAdmin(admin: IAdminInput): Promise<void> {
  const passwordHash = await hash(admin.password, bcryptRounds);
  await prisma.user.create({
    data: { email: admin.email, displayName: admin.displayName, passwordHash },
  });
}

/**
 * Imprime el resumen de filas a reasignar.
 * @param {[string, number][]} counts - Pares tabla/cantidad
 * @returns {void}
 */
function printCounts(counts: [string, number][]): void {
  printLine('\nFilas a reasignar:');
  for (const [table, count] of counts) {
    printLine(`  ${table.padEnd(labelPadding)} ${count}`);
  }
}

/**
 * Punto de entrada del script.
 * @returns {Promise<void>}
 */
async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  const source = await requireUser(options.fromEmail);
  const target = await requireUser(options.toEmail);
  if (source.id === target.id) {
    throw new Error('El usuario origen y el destino son el mismo');
  }

  // Se valida antes de mover nada para no dejar la migración a medias.
  const admin =
    options.adminEmail === null
      ? null
      : await validateAdminInput(options.adminEmail, options.adminName);

  printLine(`Origen : ${source.email} (${source.id})`);
  printLine(`Destino: ${target.email} (${target.id})`);

  abortOnConflicts(await findConflicts(source.id, target.id));
  printCounts(await countOwnedRows(source.id));

  if (!options.apply) {
    printLine('\n[dry-run] No se escribió nada. Volvé a correr con --apply para aplicar.');
    return;
  }

  await moveAndDelete(source.id, target.id);
  printLine(`\n✓ Datos movidos a ${target.email}`);
  printLine(`✓ Usuario ${source.email} eliminado`);

  if (admin !== null) {
    await createAdmin(admin);
    printLine(`✓ Usuario admin creado: ${admin.email}`);
  }
}

main()
  .catch((error: unknown) => {
    printError(`\n✗ ${error instanceof Error ? error.message : JSON.stringify(error)}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
