export class WizardAPIService {
  constructor(private readonly wizardBaseUrl: string) {}

  async request(req: Request): Promise<Record<string, any>> {
    const url = `${this.wizardBaseUrl}${req.url}`;
    const response = await fetch(url, {
      method: req.method,
      headers: req.headers,
      body: JSON.stringify(req.body),
    });
    return response.json();
  }
}
