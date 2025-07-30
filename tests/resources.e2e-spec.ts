import * as fs from 'fs';
import * as path from 'path';
import { TestClient } from 'tests/test-client';

describe('ResourcesController (e2e)', () => {
  let client: TestClient;
  let resourceId: string;

  beforeAll(async () => {
    client = await TestClient.create();
  });

  afterAll(async () => {
    await client.close();
  });

  it('files upload (POST) and files download (GET)', async () => {
    // Prepare a test file
    const testFilePath = path.join(__dirname, 'test-upload.txt');
    fs.writeFileSync(testFilePath, 'hello world');

    const parentId: string = client.namespace.root_resource_id;

    const uploadRes = await client
      .post(`/api/v1/namespaces/${client.namespace.id}/resources/files`)
      .field('namespace_id', client.namespace.id)
      .field('parent_id', parentId)
      .attach('file', testFilePath);
    expect(uploadRes.status).toBe(201);
    expect(uploadRes.body.name).toBe('test-upload.txt');
    resourceId = uploadRes.body.id;

    const downloadRes = await client
      .get(
        `/api/v1/namespaces/${client.namespace.id}/resources/files/${resourceId}`,
      )
      .expect(200);
    expect(downloadRes.header['content-disposition']).toContain(
      'test-upload.txt',
    );
    expect(downloadRes.text).toBe('hello world');

    // Clean up
    fs.unlinkSync(testFilePath);
  });
});
