import { TestClient } from 'test/test-client';
import { HttpStatus } from '@nestjs/common';
import { Image } from 'omniboxd/wizard/types/wizard.types';
import { gzipSync } from 'zlib';

describe('InternalWizardController (e2e)', () => {
  let client: TestClient;

  beforeAll(async () => {
    client = await TestClient.create();
  });

  afterAll(async () => {
    await client.close();
  });

  it('gzip_collect_callback', async () => {
    const html: string =
      '<html><body><h1>Test Page</h1><p>This is test content.</p></body></html>';
    const collectData = {
      url: 'https://example.com/test-page',
      title: 'Test Page Title',
      namespace_id: client.namespace.id,
      parentId: client.namespace.root_resource_id,
    };

    const compressedHtml = gzipSync(html);

    const taskCreateResponse = await client
      .post('/api/v1/wizard/collect/gzip')
      .field('url', collectData.url)
      .field('title', collectData.title)
      .field('namespace_id', collectData.namespace_id)
      .field('parentId', collectData.parentId)
      .attach('html', compressedHtml, {
        filename: 'html.gz',
        contentType: 'application/gzip',
      })
      .expect(HttpStatus.CREATED);

    const taskId = taskCreateResponse.body.task_id;

    const task = await client
      .get(`/internal/api/v1/wizard/task?namespace_id=${client.namespace.id}`)
      .expect(HttpStatus.OK);

    expect(task.body.input.html).toEqual(html);

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
    expect(response.status).toBe(HttpStatus.CREATED);
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

    const taskId = taskCreateResponse.body.task_id;

    const task = await client
      .get(`/internal/api/v1/wizard/task?namespace_id=${client.namespace.id}`)
      .expect(HttpStatus.OK);

    expect(task.body.input.html).toEqual(collectData.html);

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
    expect(response.status).toBe(HttpStatus.CREATED);
  });
});
