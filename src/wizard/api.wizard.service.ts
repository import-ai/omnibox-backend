import { instanceToPlain, plainToInstance } from 'class-transformer';
import { SearchRequestDto } from './dto/search-request.dto';
import { SearchResponseDto } from './dto/search-response.dto';

export class WizardAPIService {
  constructor(private readonly wizardBaseUrl: string) {}

  async request(
    method: string,
    url: string,
    body: Record<string, any>,
    headers: Record<string, string> = {},
  ): Promise<Record<string, any>> {
    const response = await fetch(`${this.wizardBaseUrl}${url}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    return response.json();
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
