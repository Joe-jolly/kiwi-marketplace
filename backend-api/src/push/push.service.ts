import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Dispatches a push notification (Mock Implementation for MVP Phase 12 Step 1).
   * Do not await this if called from a business transaction, to prevent blocking.
   */
  async sendPushNotification(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, any>,
  ): Promise<void> {
    try {
      const tokens = await this.prisma.deviceToken.findMany({
        where: { userId },
      });

      if (tokens.length === 0) {
        return;
      }

      for (const t of tokens) {
        this.logger.debug(
          `[MOCK PUSH] -> Token: ${t.token} | Title: "${title}" | Body: "${body}" | Data: ${JSON.stringify(data)}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to send push notification to user ${userId}: ${(error as Error).message}`,
      );
    }
  }
}
