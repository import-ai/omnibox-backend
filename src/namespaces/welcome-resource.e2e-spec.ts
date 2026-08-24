import { HttpStatus } from '@nestjs/common';
import { ResourceType } from 'omniboxd/resources/entities/resource.entity';
import * as request from 'supertest';
import { randomString, TestClient } from 'test/test-client';

import { WELCOME_CONTENT } from './welcome-content';

interface SignedUpUser {
  namespaceId: string;
  privateRootId: string;
  children: any[];
  get: (url: string) => request.Test;
}

describe('Welcome resource (e2e)', () => {
  let client: TestClient;

  beforeAll(async () => {
    client = await TestClient.create();
  });

  afterAll(async () => {
    await client.close();
  });

  /**
   * Sign up a brand new user with the given `x-lang` header and read back the
   * children of the private root that was created for them.
   */
  async function signUpWithLang(
    lang?: string,
    query: string = '',
  ): Promise<SignedUpUser> {
    const username = randomString(10);
    const password = randomString(12);
    const email = `${randomString(15)}@qq.com`;

    let signUpRequest = client
      .request()
      .post(`/internal/api/v1/sign-up${query}`);
    if (lang) {
      signUpRequest = signUpRequest.set('x-lang', lang);
    }
    const signUpResponse = await signUpRequest
      .send({ username, password, email })
      .expect(HttpStatus.CREATED);

    const userId = signUpResponse.body.id as string;
    const token = signUpResponse.body.access_token as string;
    const get = (url: string) =>
      client
        .request()
        .get(url)
        .set('X-User-Id', userId)
        .set('Authorization', `Bearer ${token}`);

    const namespaces = (await get('/api/v1/namespaces').expect(HttpStatus.OK))
      .body;
    expect(namespaces).toHaveLength(1);
    const namespaceId = namespaces[0].id as string;

    const privateRoot = (
      await get(`/api/v1/namespaces/${namespaceId}/private`).expect(
        HttpStatus.OK,
      )
    ).body;

    const children = (
      await get(
        `/api/v1/namespaces/${namespaceId}/resources/${privateRoot.id}/children`,
      ).expect(HttpStatus.OK)
    ).body;

    return { namespaceId, privateRootId: privateRoot.id, children, get };
  }

  /**
   * The children listing only carries a content snippet, so read the full
   * resource to compare against the hardcoded markdown.
   */
  async function getWelcomeContent(user: SignedUpUser): Promise<string> {
    const welcome = user.children[0];
    const response = await user
      .get(`/api/v1/namespaces/${user.namespaceId}/resources/${welcome.id}`)
      .expect(HttpStatus.OK);
    return response.body.content as string;
  }

  it('creates the Chinese welcome doc for x-lang: zh-CN', async () => {
    const user = await signUpWithLang('zh-CN');

    expect(user.children).toHaveLength(1);
    const [welcome] = user.children;
    expect(welcome.resource_type).toBe(ResourceType.DOC);
    expect(welcome.name).toBe(WELCOME_CONTENT.zh.name);
    expect(welcome.parent_id).toBe(user.privateRootId);
    // The doc is a normal editable resource, not a read-only system resource.
    expect(welcome.read_only).toBe(false);

    expect(await getWelcomeContent(user)).toBe(WELCOME_CONTENT.zh.content);
    // The zh markup carries text-color spans that must survive verbatim.
    expect(WELCOME_CONTENT.zh.content).toContain(
      '[[text-color color="var(--tt-color-text)"]',
    );
  });

  it('creates the English welcome doc for x-lang: en', async () => {
    const user = await signUpWithLang('en');

    expect(user.children).toHaveLength(1);
    const [welcome] = user.children;
    expect(welcome.resource_type).toBe(ResourceType.DOC);
    expect(welcome.name).toBe(WELCOME_CONTENT.en.name);
    expect(welcome.parent_id).toBe(user.privateRootId);
    expect(welcome.read_only).toBe(false);

    expect(await getWelcomeContent(user)).toBe(WELCOME_CONTENT.en.content);
  });

  it('handles a repeated lang query param', async () => {
    // Express turns a repeated query param into an array, and the query
    // resolver hands it over untouched, so the first value has to be picked
    // out before it is matched against 'zh'.
    const user = await signUpWithLang(undefined, '?lang=zh&lang=en');

    expect(user.children).toHaveLength(1);
    expect(user.children[0].name).toBe(WELCOME_CONTENT.zh.name);
  });

  it('falls back to English when no language header is sent', async () => {
    const user = await signUpWithLang();

    expect(user.children).toHaveLength(1);
    const [welcome] = user.children;
    expect(welcome.resource_type).toBe(ResourceType.DOC);
    expect(welcome.name).toBe(WELCOME_CONTENT.en.name);

    expect(await getWelcomeContent(user)).toBe(WELCOME_CONTENT.en.content);
  });
});
