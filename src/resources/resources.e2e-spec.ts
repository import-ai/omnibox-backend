import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { TestClient } from 'test/test-client';

describe('ResourcesController (e2e)', () => {
  let client: TestClient;
  let resourceId: string;
  let tempDir: string;
  let testFilePath: string;
  const filename = 'test-upload.txt';
  const fileContent = 'hello world';

  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-'));
    testFilePath = path.join(tempDir, filename);
    client = await TestClient.create();
    fs.writeFileSync(testFilePath, fileContent);
  });

  afterAll(async () => {
    await client.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('files upload (POST) and files download (GET)', async () => {
    const parentId: string = client.namespace.root_resource_id;
    const uploadRes = await client
      .post(`/api/v1/namespaces/${client.namespace.id}/resources/files`)
      .field('namespace_id', client.namespace.id)
      .field('parent_id', parentId)
      .attach('file', testFilePath);
    expect(uploadRes.status).toBe(201);
    expect(uploadRes.body.name).toBe(filename);
    resourceId = uploadRes.body.id;

    const downloadRes = await client
      .get(
        `/api/v1/namespaces/${client.namespace.id}/resources/files/${resourceId}`,
      )
      .expect(200);
    expect(downloadRes.header['content-disposition']).toContain(filename);
    expect(downloadRes.text).toBe(fileContent);
  });
});
