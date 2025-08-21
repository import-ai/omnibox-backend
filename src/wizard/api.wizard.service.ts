import { instanceToPlain, plainToInstance } from 'class-transformer';
import { Injectable } from '@nestjs/common';
import { propagation, context } from '@opentelemetry/api';
import { SearchRequestDto } from './dto/search-request.dto';
import { SearchResponseDto } from './dto/search-response.dto';

@Injectable()
export class WizardAPIService {
  constructor(private readonly wizardBaseUrl: string) {}

  getTraceHeaders(): Record<string, string> {
    const traceHeaders: Record<string, string> = {};
    propagation.inject(context.active(), traceHeaders);
    return traceHeaders;
  }

  async request(
    method: string,
    url: string,
    body: Record<string, any>,
    headers: Record<string, string> = {},
  ): Promise<Record<string, any>> {
    const requestHeaders = {
      'Content-Type': 'application/json',
      ...headers,
      ...this.getTraceHeaders(),
    };

    const response = await fetch(`${this.wizardBaseUrl}${url}`, {
      method,
      headers: requestHeaders,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    return await response.json();
  }

  async proxy(req: Request): Promise<Record<string, any>> {
    const url = `${this.wizardBaseUrl}${req.url}`;
    const response = await fetch(url, {
      method: req.method,
      headers: {
        ...this.getTraceHeaders(),
        ...req.headers,
      },
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
