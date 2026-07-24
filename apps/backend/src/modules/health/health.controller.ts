import { Controller, Get, HttpCode, HttpStatus, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Public } from '../auth/decorators/public.decorator';

interface HealthStatus {
  status: 'ok' | 'down';
  latencyMs: number;
}

@Public()
@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(private readonly prisma: PrismaService) {}

  @Get()
  check(): { status: string; service: string; timestamp: string } {
    return {
      status: 'ok',
      service: 'journal-backend',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('db')
  @HttpCode(HttpStatus.OK)
  async checkDb(): Promise<HealthStatus> {
    const start = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', latencyMs: Date.now() - start };
    } catch (err) {
      // No exponemos el mensaje crudo de Prisma al cliente; se loguea en servidor.
      this.logger.error('Health DB check falló', err instanceof Error ? err.stack : String(err));
      return { status: 'down', latencyMs: Date.now() - start };
    }
  }
}
