import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from 'omniboxd/app/app.module';

function randomChoice(choices: string): string {
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

  constructor(public readonly app: INestApplication<App>) {}

  async signUp(username?: string, password?: string, email?: string) {
    username = username || randomString(10);
    password = password || randomString(12);
    email = email || randomString(15) + '@example.com';

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

    return {
      namespace: this.namespace,
    };
  }

  request() {
    return request(this.app.getHttpServer());
  }

  get(url: string) {
    return this.request()
      .get(url)
      .set('Authorization', `Bearer ${this.user.token}`);
  }

  post(url: string) {
    return this.request()
      .post(url)
      .set('Authorization', `Bearer ${this.user.token}`);
  }

  public static async create(): Promise<TestClient> {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule.forRoot([])],
    }).compile();

    const app = moduleFixture.createNestApplication();
    await app.init();

    const client = new TestClient(app);
    await client.signUp();

    return client;
  }

  async close() {
    await this.app.close();
  }
}
