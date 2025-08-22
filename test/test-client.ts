import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from 'omniboxd/app/app.module';
import { configureApp } from 'omniboxd/app/app-config';
import {
  APIKeyPermissionTarget,
  APIKeyPermissionType,
} from 'omniboxd/api-key/api-key.entity';

export function randomChoice(choices: string): string {
  return choices[Math.floor(Math.random() * choices.length)];
}

export function randomString(length: number): string {
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const digits = '0123456789';
  let result =
    randomChoice(uppercase) + randomChoice(lowercase) + randomChoice(digits);
  for (let i = 3; i < length; i++) {
    result += randomChoice(uppercase + lowercase + digits);
  }
  return result;
}

/**
 * End-to-end test client
 */
export class TestClient {
  public user: {
    id: string;
    email: string;
    username: string;
    password: string;
    token: string;
  };

  public namespace: {
    id: string;
    name: string;
    root_resource_id: string;
  };

  public apiKey: {
    id: string;
    value: string;
  };

  constructor(public readonly app: INestApplication<App>) {}

  async signUp(username?: string, password?: string, email?: string) {
    username = username || randomString(10);
    password = password || randomString(12);
    email = email || randomString(15) + '@qq.com';

    const signUpResponse = (
      await this.request()
        .post('/internal/api/v1/sign-up')
        .send({ username, password, email })
        .expect(201)
    ).body as { id: string; access_token: string };

    expect(signUpResponse).toHaveProperty('id');
    expect(signUpResponse).toHaveProperty('access_token');

    this.user = {
      id: signUpResponse.id,
      email,
      username,
      password,
      token: signUpResponse.access_token,
    };

    return {
      user: this.user,
      ...(await this.init()),
    };
  }

  async init() {
    const namespaceGetResponse = (
      await this.get('/api/v1/namespaces').expect(200)
    ).body;

    expect(namespaceGetResponse).toHaveLength(1);
    expect(namespaceGetResponse[0].name).toContain(this.user.username);

    this.namespace = namespaceGetResponse[0];

    const apiKeyData = {
      user_id: this.user.id,
      namespace_id: this.namespace.id,
      attrs: {
        root_resource_id: this.namespace.root_resource_id,
        permissions: [
          {
            target: APIKeyPermissionTarget.RESOURCES,
            permissions: [
              APIKeyPermissionType.READ,
              APIKeyPermissionType.CREATE,
            ],
          },
        ],
      },
    };

    const apiKeyResponse = (
      await this.post('/api/v1/api-keys').send(apiKeyData).expect(201)
    ).body;

    this.apiKey = apiKeyResponse;

    return {
      namespace: this.namespace,
      apiKey: apiKeyResponse,
    };
  }

  request() {
    return request(this.app.getHttpServer());
  }

  get(url: string) {
    return this.request()
      .get(url)
      .set('Authorization', `Bearer ${this.user.token}`)
      .set('Cookie', `token=${this.user.token}`);
  }

  post(url: string) {
    return this.request()
      .post(url)
      .set('Authorization', `Bearer ${this.user.token}`)
      .set('Cookie', `token=${this.user.token}`);
  }

  patch(url: string) {
    return this.request()
      .patch(url)
      .set('Authorization', `Bearer ${this.user.token}`)
      .set('Cookie', `token=${this.user.token}`);
  }

  put(url: string) {
    return this.request()
      .put(url)
      .set('Authorization', `Bearer ${this.user.token}`)
      .set('Cookie', `token=${this.user.token}`);
  }

  delete(url: string) {
    return this.request()
      .delete(url)
      .set('Authorization', `Bearer ${this.user.token}`)
      .set('Cookie', `token=${this.user.token}`);
  }

  public static async create(): Promise<TestClient> {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule.forRoot([])],
    }).compile();

    const app = moduleFixture.createNestApplication({
      cors: true,
      bodyParser: true,
      abortOnError: false,
    });

    configureApp(app);

    await app.init();

    const client = new TestClient(app);
    await client.signUp();

    return client;
  }

  async createTags(tagNames: string[]): Promise<string[]> {
    const tagIds: string[] = [];
    for (const tagName of tagNames) {
      const response = await this.post(
        `/api/v1/namespaces/${this.namespace.id}/tag`,
      )
        .send({ name: tagName })
        .expect(201);
      tagIds.push(response.body.id);
    }
    return tagIds;
  }

  async close() {
    if (this.app) {
      await this.app.close();
    }
  }
}
