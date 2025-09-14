import { TestClient } from 'test/test-client';
import { HttpStatus } from '@nestjs/common';
import { Image } from 'omniboxd/wizard/types/wizard.types';

describe('InternalWizardController (e2e)', () => {
  let client: TestClient;

  beforeAll(async () => {
    client = await TestClient.create();
  });

  afterAll(async () => {
    await client.close();
  });

  it('collect_callback', async () => {
    const collectData = {
      html: '<html><body><h1>Test Page</h1><p>This is test content.</p></body></html>',
      url: 'https://example.com/test-page',
      title: 'Test Page Title',
      namespace_id: client.namespace.id,
      parentId: client.namespace.root_resource_id,
    };

    const taskCreateResponse = await client
      .post('/api/v1/wizard/collect')
      .send(collectData)
      .expect(HttpStatus.CREATED);

    console.log({ taskCreateResponse: taskCreateResponse.body });

    const taskId = taskCreateResponse.body.task_id;

    const fetchResponse = await client.get('/internal/api/v1/wizard/task');
    console.log({ fetchResponse: fetchResponse.body });

    const response = await client
      .post('/internal/api/v1/wizard/callback')
      .send({
        id: taskId,
        output: {
          title: 'Test Page Title',
          markdown: '![图片](http://example.com/image.png)',
          images: [
            {
              name: '图片',
              link: 'http://example.com/image.png',
              data: 'iVBORw0KGgoAAAANSUhEUgAAAAUA',
              mimetype: 'image/png',
            },
          ] as Image[],
        },
      });
    console.log({ body: response.body });
    expect(response.status).toBe(HttpStatus.CREATED);
  });
});
