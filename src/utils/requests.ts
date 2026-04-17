export class Requests {
  public static async post(
    url: string,
    json: Record<string, string>,
  ): Promise<Response> {
    return await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(json),
    });
  }
}
