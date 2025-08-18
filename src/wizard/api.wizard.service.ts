import { instanceToPlain, plainToInstance } from 'class-transformer';
import { Injectable } from '@nestjs/common';
import { trace, propagation, context, SpanStatusCode } from '@opentelemetry/api';
import { SearchRequestDto } from './dto/search-request.dto';
import { SearchResponseDto } from './dto/search-response.dto';
import { TelemetryService } from 'omniboxd/telemetry';

@Injectable()
export class WizardAPIService {
  constructor(
    private readonly wizardBaseUrl: string,
    private readonly telemetryService: TelemetryService,
  ) {}

  async request(
    method: string,
    url: string,
    body: Record<string, any>,
    headers: Record<string, string> = {},
  ): Promise<Record<string, any>> {
    return this.telemetryService.withSpan(
      `omnibox.backend.wizard.api_call`,
      async (span) => {
        // Prepare headers with trace context propagation
        const traceHeaders: Record<string, string> = {};
        
        // Inject trace context into headers
        if (this.telemetryService.isEnabled()) {
          propagation.inject(context.active(), traceHeaders);
        }

        const requestHeaders = {
          'Content-Type': 'application/json',
          ...headers,
          ...traceHeaders,
        };

        // Add span attributes
        if (span) {
          span.setAttributes({
            'http.method': method,
            'http.url': `${this.wizardBaseUrl}${url}`,
            'http.target': url,
            'service.name': 'wizard',
            'request.body_size': JSON.stringify(body).length,
          });
        }

        const response = await fetch(`${this.wizardBaseUrl}${url}`, {
          method,
          headers: requestHeaders,
          body: JSON.stringify(body),
        });

        // Add response attributes to span
        if (span) {
          span.setAttributes({
            'http.status_code': response.status,
            'http.response.size': response.headers.get('content-length') || 0,
          });
        }

        if (!response.ok) {
          const error = new Error(`Request failed with status ${response.status}`);
          if (span) {
            span.recordException(error);
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: `HTTP ${response.status}`,
            });
          }
          throw error;
        }

        const result = await response.json();
        
        if (span) {
          span.addEvent('wizard.api.response_received', {
            'response.type': typeof result,
          });
        }

        return result;
      },
      {
        'operation': 'wizard_api_call',
        'http.method': method,
        'http.target': url,
      },
    );
  }

  async proxy(req: Request): Promise<Record<string, any>> {
    const url = `${this.wizardBaseUrl}${req.url}`;
    const response = await fetch(url, {
      method: req.method,
      headers: req.headers,
      body: JSON.stringify(req.body),
    });
    return response.json();
  }

  async search(req: SearchRequestDto): Promise<SearchResponseDto> {
    const resp = await this.request(
      'POST',
      '/internal/api/v1/wizard/search',
      instanceToPlain(req),
      {},
    );
    return plainToInstance(SearchResponseDto, resp);
  }
}
