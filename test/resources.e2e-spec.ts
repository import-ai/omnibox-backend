import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from 'src/app/app.module';
import * as fs from 'fs';
import * as path from 'path';
import { App } from 'supertest/types';
import { signUp, SignUpResponse } from 'test/user.e2e-spec';

describe('ResourcesController (e2e)', () => {
  let app: INestApplication<App>;
  let user: SignUpResponse;

  let resourceId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    user = await signUp(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('/api/v1/resources/upload (POST) and /api/v1/resources/download (GET)', async () => {
    // Prepare a test file
    const testFilePath = path.join(__dirname, 'test-upload.txt');
    fs.writeFileSync(testFilePath, 'hello world');

    const privateRootResourceIdResponse = await request(app.getHttpServer())
      .get(
        `/api/v1/resources/root?namespace_id=${user.namespace.id}&space_type=private`,
      )
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);

    // Upload the file
    const uploadRes = await request(app.getHttpServer())
      .post('/api/v1/resources/upload')
      .set('Authorization', `Bearer ${user.token}`)
      .field('namespaceId', user.namespace.id)
      .field('spaceType', 'private')
      .field('parentId', '0')
      .attach('file', testFilePath);
    expect(uploadRes.status).toBe(201);
    expect(uploadRes.body.name).toBe('test-upload.txt');
    resourceId = uploadRes.body.id;

    // Download the file
    const downloadRes = await request(app.getHttpServer())
      .get('/api/v1/resources/download')
      .set('Authorization', `Bearer ${user.token}`)
      .query({ namespace: user.namespace.id, resourceId })
      .expect(200);
    expect(downloadRes.header['content-disposition']).toContain(
      'test-upload.txt',
    );
    expect(downloadRes.text).toBe('hello world');

    // Clean up
    fs.unlinkSync(testFilePath);
  });
});
