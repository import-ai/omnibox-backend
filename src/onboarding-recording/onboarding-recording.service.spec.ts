import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { OnboardingRecordingService } from './onboarding-recording.service';

function atom(type: string, payload: Buffer) {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(payload.length + 8, 0);
  header.write(type, 4, 4, 'ascii');
  return Buffer.concat([header, payload]);
}

function makeAudioFixture(durationSeconds = 4) {
  const mvhd = Buffer.alloc(20);
  mvhd.writeUInt32BE(1000, 12);
  mvhd.writeUInt32BE(durationSeconds * 1000, 16);
  return Buffer.concat([
    atom('ftyp', Buffer.alloc(8)),
    atom('moov', atom('mvhd', mvhd)),
  ]);
}

const input = {
  sessionId: 'session-1234567890',
  locale: 'zh-CN' as const,
  durationSeconds: 4,
};
const file = {
  buffer: makeAudioFixture(),
  mimetype: 'audio/mp4',
  originalname: 'recording.m4a',
  size: 5,
} as Express.Multer.File;

describe('OnboardingRecordingService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('requires shared Redis rate limiting in production', () => {
    const config = {
      get: (key: string) => (key === 'ENV' ? 'production' : undefined),
    } as unknown as ConfigService;

    expect(() => new OnboardingRecordingService(config).onModuleInit()).toThrow(
      'OBB_REDIS_URL is required',
    );
  });

  it('allows local development to use the in-process rate-limit fallback', () => {
    const config = {
      get: (key: string) => (key === 'ENV' ? 'local' : undefined),
    } as unknown as ConfigService;

    expect(() =>
      new OnboardingRecordingService(config).onModuleInit(),
    ).not.toThrow();
  });

  it('returns the transcript from the configured ASR service', async () => {
    const config = {
      get: (key: string) =>
        key === 'OBB_ONBOARDING_ASR_URL'
          ? 'https://asr.internal/transcribe'
          : undefined,
    } as unknown as ConfigService;
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ transcript: '识别结果' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await new OnboardingRecordingService(config).transcribe(
      file,
      input,
    );

    expect(result.transcript).toBe('识别结果');
    expect(result.requestId).toEqual(expect.any(String));
    expect(global.fetch).toHaveBeenCalledWith(
      'https://asr.internal/transcribe',
      expect.objectContaining({ method: 'POST', body: expect.any(FormData) }),
    );
  });

  it('reads a nested transcript response and forwards measured duration', async () => {
    const config = {
      get: (key: string) =>
        key === 'OBB_ONBOARDING_ASR_URL'
          ? 'https://asr.internal/transcribe'
          : undefined,
    } as unknown as ConfigService;
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { text: '嵌套识别结果' } }), {
        status: 200,
      }),
    );

    const result = await new OnboardingRecordingService(config).transcribe(
      file,
      input,
    );

    expect(result.transcript).toBe('嵌套识别结果');
    const request = (global.fetch as jest.Mock).mock
      .calls[0]?.[1] as RequestInit;
    expect((request.body as FormData).get('duration_seconds')).toBe('4');
  });

  it('rejects when ASR is not configured', async () => {
    const config = { get: () => undefined } as unknown as ConfigService;

    await expect(
      new OnboardingRecordingService(config).transcribe(file, input),
    ).rejects.toEqual(expect.any(ServiceUnavailableException));
  });

  it('maps an empty transcript to a no-speech error', async () => {
    const config = {
      get: (key: string) =>
        key === 'OBB_ONBOARDING_ASR_URL' ? 'https://asr.internal' : undefined,
    } as unknown as ConfigService;
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ code: 'NO_SPEECH' }), { status: 422 }),
      );

    await expect(
      new OnboardingRecordingService(config).transcribe(file, input),
    ).rejects.toEqual(expect.any(BadRequestException));
  });

  it('rejects audio whose measured duration exceeds the onboarding limit', async () => {
    const config = {
      get: (key: string) =>
        key === 'OBB_ONBOARDING_ASR_URL' ? 'https://asr.internal' : undefined,
    } as unknown as ConfigService;
    const longFile = {
      ...file,
      buffer: makeAudioFixture(16),
      size: makeAudioFixture(16).length,
    } as Express.Multer.File;
    global.fetch = jest.fn();

    await expect(
      new OnboardingRecordingService(config).transcribe(longFile, input),
    ).rejects.toEqual(expect.any(BadRequestException));
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('does not consume rate-limit capacity for invalid requests', async () => {
    const config = {
      get: (key: string) =>
        key === 'OBB_ONBOARDING_ASR_URL' ? 'https://asr.internal' : undefined,
    } as unknown as ConfigService;
    global.fetch = jest
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ transcript: 'ok' }), { status: 200 }),
        ),
      );
    const service = new OnboardingRecordingService(config);
    const invalidFile = {
      ...file,
      mimetype: 'audio/wav',
    } as Express.Multer.File;

    await expect(service.transcribe(invalidFile, input)).rejects.toEqual(
      expect.any(BadRequestException),
    );
    await Promise.all(
      Array.from({ length: 5 }, () => service.transcribe(file, input)),
    );
    await expect(service.transcribe(file, input)).rejects.toEqual(
      expect.any(BadRequestException),
    );
  });

  it('limits repeated requests from the same onboarding session', async () => {
    const config = {
      get: (key: string) =>
        key === 'OBB_ONBOARDING_ASR_URL' ? 'https://asr.internal' : undefined,
    } as unknown as ConfigService;
    global.fetch = jest
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ transcript: 'ok' }), { status: 200 }),
        ),
      );
    const service = new OnboardingRecordingService(config);

    await Promise.all(
      Array.from({ length: 5 }, () => service.transcribe(file, input)),
    );
    await expect(service.transcribe(file, input)).rejects.toEqual(
      expect.any(BadRequestException),
    );
  });

  it('limits anonymous requests from one client even when session ids rotate', async () => {
    const config = {
      get: (key: string) =>
        key === 'OBB_ONBOARDING_ASR_URL' ? 'https://asr.internal' : undefined,
    } as unknown as ConfigService;
    global.fetch = jest
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ transcript: 'ok' }), { status: 200 }),
        ),
      );
    const service = new OnboardingRecordingService(config);

    await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        service.transcribe(
          file,
          {
            ...input,
            sessionId: `rotating-session-${String(index).padStart(3, '0')}`,
          },
          '192.0.2.10',
        ),
      ),
    );
    await expect(
      service.transcribe(
        file,
        { ...input, sessionId: 'rotating-session-021' },
        '192.0.2.10',
      ),
    ).rejects.toEqual(expect.any(BadRequestException));
  });
});
