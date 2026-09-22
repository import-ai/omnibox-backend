import { TestClient } from 'test/test-client';

export const uploadLanguageDatasets = [
  { filename: 'english.txt', content: 'English content.' },
  { filename: '中文.txt', content: '中文内容。' },
  { filename: 'español.txt', content: 'Contenido en español.' },
  { filename: 'русский.txt', content: 'Русский контент.' },
  { filename: 'العربية.txt', content: 'المحتوى باللغة العربية.' },
  { filename: '日本語.txt', content: '日本語のコンテンツです。' },
  { filename: '한국어.txt', content: '한국어 콘텐츠입니다.' },
  { filename: 'français.txt', content: 'Contenu en français.' },
  { filename: 'ئۇيغۇرچە.txt', content: 'ئۇيغۇرچە مەزمۇنى.' },
  { filename: '🚀🔥.txt', content: '😊👍🌍' },
];

describe('FileResourcesController (e2e)', () => {
  let client: TestClient;

  beforeAll(async () => {
    client = await TestClient.create();
  });

  afterAll(async () => {
    await client.close();
  });

  test.each(['wps', 'wpt', 'rtf', 'odt', 'dps', 'dpt', 'odp'])(
    'accepts %s uploads',
    async (extension) => {
      const response = await client
        .post(`/api/v1/namespaces/${client.namespace.id}/resources/files`)
        .send({
          name: `example.${extension}`,
          mimetype: 'application/octet-stream',
          size: 1,
        });
      expect(response.status).toBe(201);
    },
  );

  test.each(uploadLanguageDatasets)(
    'upload and download file: $filename',
    async ({ filename, content }) => {
      const uploadRes = await client
        .post(`/api/v1/namespaces/${client.namespace.id}/resources/files`)
        .send({
          name: filename,
          mimetype: 'text/plain',
          size: content.length,
        });
      expect(uploadRes.status).toBe(201);
    },
  );
});
