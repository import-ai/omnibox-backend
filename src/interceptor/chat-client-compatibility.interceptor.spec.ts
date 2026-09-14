import {
  Controller,
  Get,
  INestApplication,
  Sse,
  UseInterceptors,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { I18nService } from 'nestjs-i18n';
import { supportsClientFeature } from 'omniboxd/utils/client-features';
import { of } from 'rxjs';
import * as request from 'supertest';

import {
  ChatClientCompatibilityInterceptor,
  withoutConversationImages,
} from './chat-client-compatibility.interceptor';

const image = {
  type: 'image',
  attachment_id: 'image-1',
  name: 'test.png',
  preview_url: '/private/image-1',
};
const text = { type: 'text', text: 'Look at this' };
const resource = { type: 'resource', resource: { id: 'doc-1', name: 'Doc' } };
const tool = { type: 'tool', tool: 'web_search' };
const message = {
  id: 'user-1',
  message: { role: 'user', content: 'Look at this' },
  attrs: {
    composer: { display_parts: [text, image, resource, tool] },
    tools: ['unchanged'],
  },
};
const conversation = {
  id: 'conversation-1',
  mapping: { 'user-1': message },
  current_node: 'user-1',
};
const event = {
  response_type: 'delta',
  event_id: '10-1',
  message: message.message,
  attrs: message.attrs,
};
const placeholder = '[Upgrade the app to view this image]';

@Controller()
@UseInterceptors(ChatClientCompatibilityInterceptor)
class FixtureController {
  @Get('history')
  history() {
    return conversation;
  }

  @Sse('events')
  events() {
    return of(
      { data: JSON.stringify(event) },
      { data: JSON.stringify({ response_type: 'done' }) },
    );
  }
}

describe('chat client compatibility', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [FixtureController],
      providers: [{ provide: I18nService, useValue: { t: () => placeholder } }],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });

  it.each(['android', 'ios'])(
    'compares numeric version segments for %s',
    (platform) => {
      for (const version of ['0.1.50', '0.1.100', '0.2.0', '1.0.0']) {
        expect(
          supportsClientFeature(
            { 'x-client-platform': platform, 'x-client-version': version },
            'conversationImages',
          ),
        ).toBe(true);
      }
      for (const version of [
        undefined,
        '',
        '0.1.9',
        '0.1.49',
        '0.0.999',
        'invalid',
        '0.1.50-beta.1',
        '0.1',
        '999999999999.0.0',
      ]) {
        expect(
          supportsClientFeature(
            { 'x-client-platform': platform, 'x-client-version': version },
            'conversationImages',
          ),
        ).toBe(false);
      }
    },
  );

  it('requires explicit supported platform identification', () => {
    for (const headers of [
      {},
      { 'user-agent': 'okhttp/4.12.0' },
      { 'user-agent': 'OmniBox/4 CFNetwork/1494 Darwin/23.4' },
      { 'user-agent': 'Mozilla/5.0' },
      { 'x-client-version': '0.1.50' },
      { 'x-client-platform': 'unknown', 'x-client-version': '1.0.0' },
      { 'x-client-platform': ['web'] },
      { 'x-client-platform': 'android', 'x-client-version': ['0.1.50'] },
    ]) {
      expect(supportsClientFeature(headers, 'conversationImages')).toBe(false);
    }
    expect(
      supportsClientFeature(
        { 'x-client-platform': 'web' },
        'conversationImages',
      ),
    ).toBe(true);
  });

  it('filters legacy history at the HTTP boundary without changing the stored payload', async () => {
    const before = JSON.stringify(conversation);
    const response = await request(app.getHttpServer())
      .get('/history')
      .set('User-Agent', 'okhttp/4.12.0')
      .expect(200);
    expect(
      response.body.mapping['user-1'].attrs.composer.display_parts,
    ).toEqual([text, resource, tool]);
    expect(response.body.mapping['user-1'].message.content).toBe(
      message.message.content,
    );
    expect(response.headers.vary).toContain('X-Client-Version');
    expect(JSON.stringify(conversation)).toBe(before);
    const current = await request(app.getHttpServer())
      .get('/history')
      .set('X-Client-Platform', 'android')
      .set('X-Client-Version', '0.1.50')
      .expect(200);
    expect(current.body).toEqual(conversation);
    const web = await request(app.getHttpServer())
      .get('/history')
      .set('X-Client-Platform', 'web')
      .expect(200);
    expect(web.body).toEqual(conversation);
  });

  it('filters serialized live/replayed SSE deltas while preserving event ids and completion', async () => {
    const legacy = await request(app.getHttpServer())
      .get('/events')
      .set('User-Agent', 'okhttp/4.12.0')
      .expect(200);
    expect(legacy.text).not.toContain('attachment_id');
    expect(legacy.text).toContain('10-1');
    expect(legacy.text).toContain('done');
    const current = await request(app.getHttpServer())
      .get('/events')
      .set('X-Client-Platform', 'ios')
      .set('X-Client-Version', '0.1.50')
      .expect(200);
    expect(current.text).toContain('attachment_id');
    const web = await request(app.getHttpServer())
      .get('/events')
      .set('X-Client-Platform', 'web')
      .expect(200);
    expect(web.text).toContain('attachment_id');
    expect(event.attrs.composer.display_parts).toContainEqual(image);
  });

  it('handles image-only history and leaves unrelated or non-JSON events intact', () => {
    const imageOnly = {
      ...message,
      message: { role: 'user', content: '' },
      attrs: { composer: { display_parts: [image] } },
    };
    expect(
      withoutConversationImages(imageOnly, placeholder).message.content,
    ).toBe(placeholder);
    expect(imageOnly.message.content).toBe('');
    const heartbeat = { data: '[DONE]', id: 'last' };
    expect(withoutConversationImages(heartbeat, placeholder)).toBe(heartbeat);
    expect(
      withoutConversationImages({ data: '{invalid' }, placeholder),
    ).toEqual({ data: '{invalid' });
    expect(
      withoutConversationImages({ message: 'error' }, placeholder),
    ).toEqual({ message: 'error' });
  });
});
