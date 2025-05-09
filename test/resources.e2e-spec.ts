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

  it('files upload (POST) and files download (GET)', async () => {
    // Prepare a test file
    const testFilePath = path.join(__dirname, 'test-upload.txt');
    fs.writeFileSync(testFilePath, 'hello world');

    const spaceType: string = 'private';

    const privateRootResourceIdResponse = await request(app.getHttpServer())
      .get(
        `/api/v1/resources/root?namespace_id=${user.namespace.id}&space_type=${spaceType}`,
      )
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);

    const parentId: string = privateRootResourceIdResponse.body.id;

    const uploadRes = await request(app.getHttpServer())
      .post('/api/v1/resources/files')
      .set('Authorization', `Bearer ${user.token}`)
      .field('namespace_id', user.namespace.id)
      .field('parent_id', parentId)
      .attach('file', testFilePath);
    expect(uploadRes.status).toBe(201);
    expect(uploadRes.body.name).toBe('test-upload.txt');
    resourceId = uploadRes.body.id;

    const downloadRes = await request(app.getHttpServer())
      .get(`/api/v1/resources/files/${resourceId}`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(downloadRes.header['content-disposition']).toContain(
      'test-upload.txt',
    );
    expect(downloadRes.text).toBe('hello world');

    // Clean up
    fs.unlinkSync(testFilePath);
  });
});
