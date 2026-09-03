import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from 'redis';

import { getMp4DurationSeconds } from './audio-duration';
import {
  OnboardingTranscribeDto,
  OnboardingTranscribeResponseDto,
} from './dto/onboarding-transcribe.dto';

const MAX_AUDIO_SIZE_BYTES = 10 * 1024 * 1024;
const SESSION_WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_SESSION = 5;
const MAX_REQUESTS_PER_CLIENT = 20;
const SUPPORTED_AUDIO_MIME_TYPES = new Set([
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
]);
const CONSUME_RATE_LIMIT_SCRIPT = `
local clientCount = redis.call('INCR', KEYS[1])
if clientCount == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[3]) end
if clientCount > tonumber(ARGV[1]) then return 0 end

local sessionCount = redis.call('INCR', KEYS[2])
if sessionCount == 1 then redis.call('PEXPIRE', KEYS[2], ARGV[3]) end
if sessionCount > tonumber(ARGV[2]) then return 0 end

return 1
`;

type SessionWindow = { count: number; startedAt: number };
type OnboardingRedisClient = ReturnType<typeof createClient>;

@Injectable()
export class OnboardingRecordingService
  implements OnModuleDestroy, OnModuleInit
{
  private readonly logger = new Logger(OnboardingRecordingService.name);
  private readonly sessionWindows = new Map<string, SessionWindow>();
  private redisClient: OnboardingRedisClient | null = null;
  private redisConnectionPromise: Promise<OnboardingRedisClient> | null = null;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const environment = (
      this.config.get<string>('ENV') ??
      this.config.get<string>('NODE_ENV') ??
      ''
    ).toLowerCase();
    const production = environment === 'production' || environment === 'prod';
    if (production && !this.config.get<string>('OBB_REDIS_URL')) {
      throw new Error(
        'OBB_REDIS_URL is required for onboarding ASR in production',
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.redisConnectionPromise?.catch(() => undefined);
    if (this.redisClient?.isOpen) await this.redisClient.quit();
  }

  async transcribe(
    file: Express.Multer.File | undefined,
    input: OnboardingTranscribeDto,
    clientAddress = 'unknown',
  ): Promise<OnboardingTranscribeResponseDto> {
    this.validateFile(file);

    const durationSeconds = getMp4DurationSeconds(file.buffer);
    if (durationSeconds === null) {
      throw new BadRequestException('ONBOARDING_AUDIO_DURATION_INVALID');
    }
    if (durationSeconds > 15.5) {
      throw new BadRequestException('ONBOARDING_AUDIO_TOO_LONG');
    }

    const endpoint = this.config.get<string>('OBB_ONBOARDING_ASR_URL');
    if (!endpoint) {
      throw new ServiceUnavailableException('ONBOARDING_ASR_NOT_CONFIGURED');
    }

    await this.consumeSessionQuota(input.sessionId, clientAddress);

    const body = new FormData();
    const audioBytes = file.buffer.buffer.slice(
      file.buffer.byteOffset,
      file.buffer.byteOffset + file.buffer.byteLength,
    ) as ArrayBuffer;
    body.append(
      'audio',
      new Blob([audioBytes], { type: file.mimetype || 'audio/mp4' }),
      file.originalname || 'onboarding-recording.m4a',
    );
    body.append('locale', input.locale);
    body.append('session_id', input.sessionId);
    body.append('duration_seconds', String(durationSeconds));

    const token = this.config.get<string>('OBB_ONBOARDING_ASR_TOKEN');
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body,
        signal: AbortSignal.timeout(12_000),
      });
    } catch {
      throw new ServiceUnavailableException('ONBOARDING_ASR_NETWORK_ERROR');
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new ServiceUnavailableException('ONBOARDING_ASR_INVALID_RESPONSE');
    }

    if (!response.ok) {
      if (this.isNoSpeechResponse(payload)) {
        throw new BadRequestException('ONBOARDING_ASR_NO_SPEECH');
      }
      if (response.status >= 400 && response.status < 500) {
        throw new BadRequestException('ONBOARDING_ASR_INVALID_REQUEST');
      }
      throw new ServiceUnavailableException('ONBOARDING_ASR_NETWORK_ERROR');
    }

    const transcript = this.readTranscript(payload);
    if (!transcript) {
      throw new BadRequestException('ONBOARDING_ASR_NO_SPEECH');
    }

    return { transcript, requestId: randomUUID() };
  }

  private validateFile(
    file: Express.Multer.File | undefined,
  ): asserts file is Express.Multer.File {
    if (!file || !file.buffer?.length) {
      throw new BadRequestException('ONBOARDING_AUDIO_REQUIRED');
    }
    if (
      !file.mimetype ||
      !SUPPORTED_AUDIO_MIME_TYPES.has(file.mimetype.toLowerCase())
    ) {
      throw new BadRequestException('ONBOARDING_AUDIO_INVALID_TYPE');
    }
    if (file.size > MAX_AUDIO_SIZE_BYTES) {
      throw new BadRequestException('ONBOARDING_AUDIO_TOO_LARGE');
    }
  }

  private async consumeSessionQuota(sessionId: string, clientAddress: string) {
    const redis = await this.getRedisClient();
    if (redis) {
      const allowed = await redis.eval(CONSUME_RATE_LIMIT_SCRIPT, {
        keys: [
          `onboarding-asr:client:${clientAddress}`,
          `onboarding-asr:session:${clientAddress}:${sessionId}`,
        ],
        arguments: [
          MAX_REQUESTS_PER_CLIENT.toString(),
          MAX_REQUESTS_PER_SESSION.toString(),
          SESSION_WINDOW_MS.toString(),
        ],
      });
      if (allowed !== 1) {
        throw new BadRequestException('ONBOARDING_ASR_RATE_LIMITED');
      }
      return;
    }

    this.consumeLocalSessionQuota(sessionId, clientAddress);
  }

  private consumeLocalSessionQuota(sessionId: string, clientAddress: string) {
    const now = Date.now();
    if (this.sessionWindows.size > 1000) {
      for (const [key, window] of this.sessionWindows) {
        if (now - window.startedAt >= SESSION_WINDOW_MS)
          this.sessionWindows.delete(key);
      }
    }
    const clientKey = `client:${clientAddress}`;
    const sessionKey = `session:${clientAddress}:${sessionId}`;
    const previousClient = this.sessionWindows.get(clientKey);
    if (previousClient && now - previousClient.startedAt < SESSION_WINDOW_MS) {
      if (previousClient.count >= MAX_REQUESTS_PER_CLIENT) {
        throw new BadRequestException('ONBOARDING_ASR_RATE_LIMITED');
      }
      previousClient.count += 1;
    } else {
      this.sessionWindows.set(clientKey, { count: 1, startedAt: now });
    }

    const previous = this.sessionWindows.get(sessionKey);
    if (!previous || now - previous.startedAt >= SESSION_WINDOW_MS) {
      this.sessionWindows.set(sessionKey, { count: 1, startedAt: now });
      return;
    }
    if (previous.count >= MAX_REQUESTS_PER_SESSION) {
      throw new BadRequestException('ONBOARDING_ASR_RATE_LIMITED');
    }
    previous.count += 1;
  }

  private async getRedisClient(): Promise<OnboardingRedisClient | null> {
    if (this.redisClient?.isOpen) return this.redisClient;
    if (this.redisConnectionPromise) return this.redisConnectionPromise;

    const redisUrl = this.config.get<string>('OBB_REDIS_URL');
    if (!redisUrl) return null;

    const client = createClient({ url: redisUrl });
    client.on('error', (error: Error) => {
      this.logger.error(
        'Redis error while enforcing onboarding ASR rate limits',
        error.stack,
      );
    });
    this.redisClient = client;
    this.redisConnectionPromise = client
      .connect()
      .then(() => client)
      .catch((error: unknown) => {
        this.redisClient = null;
        this.logger.error(
          'Failed to connect to Redis for onboarding ASR rate limiting',
          error instanceof Error ? error.stack : String(error),
        );
        throw new ServiceUnavailableException(
          'ONBOARDING_RATE_LIMIT_UNAVAILABLE',
        );
      });

    try {
      return await this.redisConnectionPromise;
    } finally {
      this.redisConnectionPromise = null;
    }
  }

  private readTranscript(payload: unknown): string {
    if (!payload || typeof payload !== 'object') return '';
    const record = payload as Record<string, unknown>;
    const nestedData = record.data ?? record.result;
    const nestedRecord =
      nestedData && typeof nestedData === 'object'
        ? (nestedData as Record<string, unknown>)
        : undefined;
    const transcript =
      record.transcript ??
      record.text ??
      nestedRecord?.transcript ??
      nestedRecord?.text;
    return typeof transcript === 'string' ? transcript.trim() : '';
  }

  private isNoSpeechResponse(payload: unknown): boolean {
    if (!payload || typeof payload !== 'object') return false;
    const record = payload as Record<string, unknown>;
    const codeValue = record.code ?? record.error_code;
    const messageValue = record.message ?? record.error;
    const code = typeof codeValue === 'string' ? codeValue.toLowerCase() : '';
    const message =
      typeof messageValue === 'string' ? messageValue.toLowerCase() : '';
    return code.includes('no_speech') || message.includes('no speech');
  }
}
