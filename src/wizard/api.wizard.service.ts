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
}
