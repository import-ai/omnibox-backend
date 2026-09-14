import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AttributionReporter {
  private readonly logger = new Logger(AttributionReporter.name);
  private readonly proUrl: string | undefined;
  private readonly seenActivity = new Set<string>();
  private seenDay = '';

  constructor(private readonly configService: ConfigService) {
    this.proUrl = this.configService.get<string>('OBB_PRO_URL');
  }

  reportActivity(userId: string): void {
    const day = new Date().toISOString().slice(0, 10);
    if (this.seenDay !== day) {
      this.seenDay = day;
      this.seenActivity.clear();
    }
    if (this.seenActivity.has(userId)) return;
    this.seenActivity.add(userId);
    void this.postEvent(userId);
  }

  private async postEvent(userId: string): Promise<void> {
    if (!this.proUrl || !userId) return;
    try {
      await fetch(`${this.proUrl}/internal/api/v1/attribution/user-events`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId }),
        signal: AbortSignal.timeout(2_000),
      });
    } catch (error) {
      this.logger.warn(
        `Failed to report attribution activity for ${userId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
