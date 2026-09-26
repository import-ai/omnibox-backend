import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { I18nService } from 'nestjs-i18n';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { Repository } from 'typeorm';

import {
  CreateClientRequestDto,
  CreateClientResponseDto,
} from './dto/create-client-request.dto';
import { OAuthClient } from './entities/oauth-client.entity';

export const DESKTOP_CLIENT_ID = 'omnibox-desktop';

type RegisteredClient = Pick<
  OAuthClient,
  'clientId' | 'clientSecret' | 'name' | 'redirectUris' | 'scopes'
>;

@Injectable()
export class OAuthClientService {
  private readonly logger = new Logger(OAuthClientService.name);

  constructor(
    @InjectRepository(OAuthClient)
    private readonly clientRepository: Repository<OAuthClient>,
    private readonly i18n: I18nService,
  ) {}

  async create(dto: CreateClientRequestDto): Promise<CreateClientResponseDto> {
    const existingClient = await this.clientRepository.findOne({
      where: { clientId: dto.clientId },
    });

    if (existingClient || dto.clientId === DESKTOP_CLIENT_ID) {
      throw new AppException(
        this.i18n.t('auth.oauth.errors.clientAlreadyExists'),
        'OAUTH_CLIENT_ALREADY_EXISTS',
        HttpStatus.CONFLICT,
      );
    }

    const plainSecret = this.generateClientSecret();
    const hashedSecret = await bcrypt.hash(plainSecret, 10);

    const client = this.clientRepository.create({
      clientId: dto.clientId,
      clientSecret: hashedSecret,
      name: dto.name,
      redirectUris: dto.redirectUris,
      scopes: dto.scopes || ['openid', 'profile', 'email'],
      isActive: true,
    });

    await this.clientRepository.save(client);

    this.logger.log(`Created OAuth client: ${dto.clientId}`);

    return {
      clientId: client.clientId,
      clientSecret: plainSecret,
      name: client.name,
      redirectUris: client.redirectUris,
      scopes: client.scopes,
    };
  }

  async findByClientId(clientId: string): Promise<RegisteredClient | null> {
    if (clientId === DESKTOP_CLIENT_ID) {
      return {
        clientId: DESKTOP_CLIENT_ID,
        clientSecret: '',
        name: 'OmniBox Desktop',
        redirectUris: ['omnibox://oauth/callback'],
        scopes: ['openid', 'profile', 'email'],
      };
    }
    return this.clientRepository.findOne({
      where: { clientId, isActive: true },
    });
  }

  async validateClient(
    clientId: string,
    clientSecret: string,
  ): Promise<RegisteredClient> {
    const client = await this.findByClientId(clientId);

    if (!client) {
      throw new AppException(
        this.i18n.t('auth.oauth.errors.invalidClient'),
        'OAUTH_INVALID_CLIENT',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const isValidSecret = await bcrypt.compare(
      clientSecret,
      client.clientSecret,
    );
    if (!isValidSecret) {
      throw new AppException(
        this.i18n.t('auth.oauth.errors.invalidClientCredentials'),
        'OAUTH_INVALID_CLIENT_CREDENTIALS',
        HttpStatus.UNAUTHORIZED,
      );
    }

    return client;
  }

  validateRedirectUri(client: RegisteredClient, redirectUri: string): boolean {
    return client.redirectUris.includes(redirectUri);
  }

  validateScopes(
    client: RegisteredClient,
    requestedScopes: string[],
  ): string[] {
    return requestedScopes.filter((scope) => client.scopes.includes(scope));
  }

  private generateClientSecret(): string {
    return crypto.randomBytes(32).toString('hex');
  }
}
