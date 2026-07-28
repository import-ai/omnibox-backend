import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { trace } from '@opentelemetry/api';
import { Span } from 'nestjs-otel';
import { RssPollingService } from 'omniboxd/rss/rss-polling.service';

@Injectable()
export class RssPollingCronService {
  private readonly logger = new Logger(RssPollingCronService.name);

  constructor(private readonly rssPollingService: RssPollingService) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  @Span('RssPollingCronService.pollDueLinks')
  async pollDueLinks(): Promise<void> {
    const summary = await this.rssPollingService.pollDueLinks();
    if (summary.claimed === 0) {
      return;
    }
    trace.getActiveSpan()?.setAttributes({
      'rss.poll.claimed': summary.claimed,
      'rss.poll.succeeded': summary.succeeded,
      'rss.poll.failed': summary.failed,
    });
    this.logger.log(`Polled rss links: ${JSON.stringify(summary)}`);
  }
}
