import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { trace } from '@opentelemetry/api';

@Injectable()
export class AttributionReporter {
  private readonly proUrl: string | undefined;
  private readonly seenActivity = new Set<string>();
  private readonly seenKeyAction = new Set<string>();
  private seenDay = '';

  constructor(private readonly configService: ConfigService) {
    this.proUrl = this.configService.get<string>('OBB_PRO_URL');
  }

  reportActivity(userId: string): void {
    this.resetSeenOnNewDay();
    if (this.seenActivity.has(userId)) return;
    void this.postEvent(userId);
  }

  reportKeyActionCandidate(userId: string): void {
    if (!userId) return;
    this.resetSeenOnNewDay();
    if (this.seenKeyAction.has(userId)) return;
    void this.postKeyActionCandidate(userId);
  }

  private resetSeenOnNewDay(): void {
    const day = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    if (this.seenDay !== day) {
      this.seenDay = day;
      this.seenActivity.clear();
      this.seenKeyAction.clear();
    }
  }

  private async postEvent(userId: string): Promise<void> {
    if (!this.proUrl || !userId) return;
    try {
      const response = await fetch(
        `${this.proUrl}/internal/api/v1/attribution/user-events`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ user_id: userId }),
          signal: AbortSignal.timeout(2_000),
        },
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      this.seenActivity.add(userId);
    } catch (error) {
      const span = trace.getActiveSpan();
      if (error instanceof Error) {
        span?.recordException(error);
      }
      span?.addEvent('attribution.activity.failed', {
        'user.id': userId,
        'error.message': error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async postKeyActionCandidate(userId: string): Promise<void> {
    if (!this.proUrl || !userId) return;
    try {
      const response = await fetch(
        `${this.proUrl}/internal/api/v1/attribution/key-action-candidates`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ user_id: userId }),
          signal: AbortSignal.timeout(2_000),
        },
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      this.seenKeyAction.add(userId);
    } catch (error) {
      const span = trace.getActiveSpan();
      if (error instanceof Error) {
        span?.recordException(error);
      }
      span?.addEvent('attribution.key_action_candidate.failed', {
        'user.id': userId,
        'error.message': error instanceof Error ? error.message : String(error),
      });
    }
  }
}
