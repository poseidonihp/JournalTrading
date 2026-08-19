import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { pgPoolConfig } from '../src/prisma/pg-connection';
import {
  PrismaClient,
  InstrumentCategory,
  TrackerAccountStatus,
  TrackerAccountType,
} from '../src/generated/prisma/client';
import * as bcrypt from 'bcryptjs';

// Prisma 7 ya no carga .env automáticamente y el seed corre por tsx, no por el CLI.
const envPath = join(__dirname, '..', '.env');
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg(pgPoolConfig(process.env['DATABASE_URL'])),
});

const SEED_USER_EMAIL = process.env.SEED_USER_EMAIL ?? 'dev@journal.local';
const SEED_USER_PASSWORD = process.env.SEED_USER_PASSWORD ?? 'journal123';
const SEED_USER_NAME = process.env.SEED_USER_NAME ?? 'Dev User';

// El usuario de desarrollo lleva password por defecto conocida, así que sólo se
// siembra si se pide explícitamente. En producción no debe definirse el flag.
const seedDevUser = process.env.SEED_DEV_USER === 'true';

async function main() {
  // Instrumentos (idempotente: upsert por symbol)
  const instruments = [
    {
      symbol: 'MES',
      name: 'Micro E-mini S&P 500',
      category: InstrumentCategory.FUTURE,
      pointValue: '5',
      defaultCommissionPerContract: '1.22',
      tickSize: '0.25',
      currency: 'USD',
    },
    {
      symbol: 'MNQ',
      name: 'Micro E-mini Nasdaq-100',
      category: InstrumentCategory.FUTURE,
      pointValue: '2',
      defaultCommissionPerContract: '1.22',
      tickSize: '0.25',
      currency: 'USD',
    },
    {
      symbol: 'CFD',
      name: 'CFD genérico (1 USD por punto)',
      category: InstrumentCategory.CFD,
      pointValue: '1',
      defaultCommissionPerContract: '0.10',
      tickSize: '0.01',
      currency: 'USD',
    },
  ];

  for (const i of instruments) {
    await prisma.instrument.upsert({
      where: { symbol: i.symbol },
      update: {
        name: i.name,
        category: i.category,
        pointValue: i.pointValue,
        defaultCommissionPerContract: i.defaultCommissionPerContract,
        tickSize: i.tickSize,
        currency: i.currency,
      },
      create: i,
    });
  }
  console.log(`✓ Instrumentos sembrados (${instruments.length})`);

  // Lo que sigue son datos de ejemplo colgados del usuario de desarrollo:
  // no debe recrearse en producción (password por defecto conocida).
  if (!seedDevUser) {
    console.info('↷ Usuario dev y datos de ejemplo omitidos (SEED_DEV_USER != true)');
    return;
  }

  // User de desarrollo
  const passwordHash = await bcrypt.hash(SEED_USER_PASSWORD, 12);
  const user = await prisma.user.upsert({
    where: { email: SEED_USER_EMAIL },
    update: { displayName: SEED_USER_NAME },
    create: {
      email: SEED_USER_EMAIL,
      passwordHash,
      displayName: SEED_USER_NAME,
    },
  });
  console.log(`✓ Dev user: ${user.email} / ${SEED_USER_PASSWORD}`);

  // Cuenta ejemplo
  await prisma.account.upsert({
    where: { userId_name: { userId: user.id, name: 'Sim' } },
    update: {},
    create: {
      userId: user.id,
      name: 'Sim',
      broker: 'NinjaTrader',
      currency: 'USD',
      initialBalance: '5000',
    },
  });
  await prisma.account.upsert({
    where: { userId_name: { userId: user.id, name: 'Real' } },
    update: {},
    create: {
      userId: user.id,
      name: 'Real',
      broker: 'NinjaTrader',
      currency: 'USD',
      initialBalance: '0',
      isActive: false,
    },
  });
  console.log('✓ Cuentas ejemplo: Sim, Real');

  // Tipos de trade por defecto (administrables desde la UI)
  const defaultTradeTypes = [
    { name: 'Continuación', color: '#6366f1', code: 'CONTINUATION' },
    { name: 'Rompimiento', color: '#22c55e', code: 'BREAKOUT' },
    { name: 'Cambio de Tendencia', color: '#a855f7', code: 'TREND_REVERSAL' },
    { name: 'Lateral', color: '#0ea5e9', code: 'RANGE' },
    { name: 'Apertura', color: '#f59e0b', code: 'OPENING' },
  ];
  for (const tt of defaultTradeTypes) {
    await prisma.tradeType.upsert({
      where: { userId_name: { userId: user.id, name: tt.name } },
      update: { color: tt.color, code: tt.code },
      create: { userId: user.id, name: tt.name, color: tt.color, code: tt.code },
    });
  }
  console.log(`✓ Tipos de trade sembrados (${defaultTradeTypes.length})`);

  // Tracker accounts (cuentas de prop firms para la pantalla Accounts)
  // Datos de ejemplo (anónimos). Ajusta según tus cuentas reales en tu entorno local.
  const trackerAccounts: {
    name: string;
    type: TrackerAccountType;
    status: TrackerAccountStatus;
    company: string;
    totalExpenses: string;
    totalProfits: string;
  }[] = [
    { name: 'EVAL-0001', type: 'EVALUATION', status: 'ACTIVE', company: 'Prop Firm A', totalExpenses: '150.00', totalProfits: '0' },
    { name: 'EVAL-0002', type: 'EVALUATION', status: 'SUSPENDED', company: 'Prop Firm B', totalExpenses: '99.00', totalProfits: '0' },
    { name: 'LIVE-0001', type: 'LIVE', status: 'ACTIVE', company: 'Prop Firm C', totalExpenses: '200.00', totalProfits: '1500.00' },
  ];
  for (const ta of trackerAccounts) {
    await prisma.trackerAccount.upsert({
      where: { userId_name: { userId: user.id, name: ta.name } },
      update: {
        type: ta.type,
        status: ta.status,
        company: ta.company,
        totalExpenses: ta.totalExpenses,
        totalProfits: ta.totalProfits,
      },
      create: {
        userId: user.id,
        name: ta.name,
        type: ta.type,
        status: ta.status,
        company: ta.company,
        totalExpenses: ta.totalExpenses,
        totalProfits: ta.totalProfits,
      },
    });
  }
  console.log(`✓ Tracker accounts sembradas (${trackerAccounts.length})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
