/**
 * Verificación de cuadre: el neto del digest del mentor debe coincidir al
 * centavo con `GET /api/insights/kpis` del mismo rango. Uso:
 *   pnpm --filter @journal/backend exec tsx scripts/check-mentor-digest.ts [YYYY-MM]
 */
import { existsSync } from 'node:fs';
import path from 'node:path';

const envPath = path.join(__dirname, '..', '.env');
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

import { PrismaService } from '../src/prisma/prisma.service';
import { InsightsService } from '../src/modules/insights/insights.service';
import { DigestBuilder } from '../src/modules/mentor/digest.builder';

async function main(): Promise<void> {
  const month = process.argv[2];
  const prisma = new PrismaService();
  await prisma.$connect();

  const insights = new InsightsService(prisma);
  const builder = new DigestBuilder(prisma);
  const users = await prisma.user.findMany({ select: { id: true, email: true } });

  for (const user of users) {
    const digest = await builder.build(user.id, month ? { month } : {}, 1_000_000_000);
    const kpis = await insights.kpis(user.id, month ? { month } : {});
    const match = digest.overall.netAfterDataFees === kpis.netPnl;
    console.info(
      [
        `${user.email} · ${digest.period.label}`,
        `  trades  digest=${digest.overall.trades} kpis=${kpis.totalTrades}`,
        `  neto    digest=${digest.overall.netAfterDataFees} kpis=${kpis.netPnl} ${match ? 'OK' : 'DIFIERE'}`,
        `  fees    digest=${digest.overall.dataFees} kpis=${kpis.dataFees}`,
        `  winRate digest=${digest.overall.winRate} kpis=${kpis.winRate}`,
        `  dims=${digest.dimensions.length} candidatos=${digest.eliminateCandidates.length} notas=${digest.notes.trades.length} chars=${JSON.stringify(digest).length}`,
      ].join('\n'),
    );
  }

  await prisma.$disconnect();
}

void main();
