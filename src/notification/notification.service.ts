import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { context, propagation, trace } from '@opentelemetry/api';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { NotificationSendRequestDto } from './dto/notification-send-request.dto';

@Injectable()
export class NotificationService {
  private readonly proUrl: string | undefined;
  private readonly tracer = trace.getTracer('notification-service');

  constructor(private readonly configService: ConfigService) {
    this.proUrl = this.configService.get<string>('OBB_PRO_URL');
  }

  async send(data: NotificationSendRequestDto): Promise<void> {
    if (!this.proUrl) {
      return;
    }

    return this.tracer.startActiveSpan(
      'NotificationService.send',
      {},
      context.active(),
      async (span) => {
        try {
          span.setAttribute('notification.user_id', data.userId);
          span.setAttribute('notification.title', data.title);

          // Inject trace headers for downstream service
          const traceHeaders: Record<string, string> = {};
          propagation.inject(context.active(), traceHeaders);

          const response = await fetch(
            `${this.proUrl}/internal/api/v1/notification/send`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...traceHeaders,
              },
              body: JSON.stringify(data),
            },
          );

          if (!response.ok) {
            span.setStatus({ code: 2, message: 'Failed to send notification' });
            throw new AppException(
              'Failed to send notification',
              'NOTIFICATION_SEND_FAILED',
              500,
            );
          }

          span.setStatus({ code: 1 });
        } finally {
          span.end();
        }
      },
    );
  }
}
