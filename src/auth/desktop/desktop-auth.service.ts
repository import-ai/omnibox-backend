import { createHash, randomBytes } from 'node:crypto';

import { HttpStatus, Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { I18nService } from 'nestjs-i18n';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { UserService } from 'omniboxd/user/user.service';
import { createClient } from 'redis';

import { AuthService } from '../auth.service';

export const AUTHORIZE_DESKTOP = `
local raw = redis.call('GET', KEYS[1])
if not raw then return 0 end
local tx = cjson.decode(raw)
if tx.user then return 0 end
tx.user = ARGV[1]
tx.code = ARGV[2]
redis.call('SET', KEYS[1], cjson.encode(tx), 'EX', 60)
return 1`;
export const EXCHANGE_DESKTOP = `
local raw = redis.call('GET', KEYS[1])
if not raw then return false end
local tx = cjson.decode(raw)
if not tx.user or tx.code ~= ARGV[1] or tx.challenge ~= ARGV[2] then return false end
redis.call('DEL', KEYS[1])
return tx.user`;
const RATE_LIMIT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], 60) end
return count`;
export const desktopDigest = (value: string) =>
  createHash('sha256').update(value).digest('base64url');

@Injectable()
export class DesktopAuthService implements OnModuleDestroy {
  private client?: ReturnType<typeof createClient>;
  private connecting?: Promise<unknown>;

  constructor(
    private readonly config: ConfigService,
    private readonly auth: AuthService,
    private readonly users: UserService,
    private readonly i18n: I18nService,
  ) {}

  private invalid(status = HttpStatus.BAD_REQUEST): never {
    throw new AppException(
      this.i18n.t('auth.desktop.invalid'),
      'DESKTOP_AUTH_INVALID',
      status,
    );
  }

  private key(id: string) {
    return `desktop-auth:${this.config.get('OBB_BASE_URL')}:${id}`;
  }

  private async redis() {
    if (!this.client) {
      const url = this.config.get<string>('OBB_REDIS_URL');
      if (!url) this.invalid(HttpStatus.SERVICE_UNAVAILABLE);
      this.client = createClient({
        url,
        disableOfflineQueue: true,
        socket: { connectTimeout: 3000, reconnectStrategy: false },
      });
      this.client.on('error', () => undefined);
    }
    if (this.connecting) await this.connecting;
    if (!this.client.isOpen) {
      this.connecting ??= this.client.connect().finally(() => {
        this.connecting = undefined;
      });
      await this.connecting;
    }
    return this.client;
  }

  private async limit(identity: string) {
    const redis = await this.redis();
    const count = await redis.eval(RATE_LIMIT, {
      keys: [this.key(`limit:${desktopDigest(identity)}`)],
      arguments: [],
    });
    // ponytail: per-peer limits also group reverse-proxy traffic; use ingress limits if throughput requires per-client accounting.
    if (Number(count) > 60) this.invalid(HttpStatus.TOO_MANY_REQUESTS);
    return redis;
  }

  async start(challenge: string, state: string, clientId: string, ip: string) {
    const scheme = this.config.get<string>('OBB_DESKTOP_AUTH_SCHEME');
    if (!scheme || !/^omnibox-auth-(test|pre|prod)$/.test(scheme))
      this.invalid(HttpStatus.SERVICE_UNAVAILABLE);
    if (clientId !== scheme) this.invalid();
    const redis = await this.limit(`start:${ip}`);
    const transaction = randomBytes(32).toString('hex');
    await redis.set(
      this.key(transaction),
      JSON.stringify({ challenge, state, scheme }),
      { EX: 300, NX: true },
    );
    return { transaction, expires_in: 300 };
  }

  async authorize(
    transaction: string,
    authorization: string,
    expectedUserId: string,
  ) {
    // Cookies alone must never authorize a desktop session.
    if (!/^Bearer \S+$/.test(authorization || ''))
      this.invalid(HttpStatus.UNAUTHORIZED);
    const payload = this.auth.jwtVerify(authorization.slice(7));
    if (payload.sub !== expectedUserId) this.invalid(HttpStatus.UNAUTHORIZED);
    const user = await this.users.find(payload.sub);
    if (!user) this.invalid(HttpStatus.UNAUTHORIZED);
    const redis = await this.limit(`authorize:${user.id}`);
    const raw = await redis.get(this.key(transaction));
    if (!raw) this.invalid();
    const tx = JSON.parse(raw);
    const code = randomBytes(32).toString('hex');
    const ok = await redis.eval(AUTHORIZE_DESKTOP, {
      keys: [this.key(transaction)],
      arguments: [user.id, desktopDigest(code)],
    });
    if (ok !== 1) this.invalid();
    const callback = new URL(`${tx.scheme}://login`);
    callback.search = new URLSearchParams({
      transaction,
      code,
      state: tx.state,
    }).toString();
    return { callback_url: callback.href };
  }

  async exchange(
    transaction: string,
    code: string,
    verifier: string,
    ip: string,
  ) {
    const redis = await this.limit(`exchange:${ip}`);
    const userId = await redis.eval(EXCHANGE_DESKTOP, {
      keys: [this.key(transaction)],
      arguments: [desktopDigest(code), desktopDigest(verifier)],
    });
    if (typeof userId !== 'string') this.invalid();
    const user = await this.users.find(userId);
    if (!user) this.invalid(HttpStatus.UNAUTHORIZED);
    return this.auth.login(user);
  }

  async onModuleDestroy() {
    if (this.client?.isOpen) await this.client.disconnect();
  }
}
