import { Injectable, HttpStatus, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { I18nService } from 'nestjs-i18n';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { OAuthClient } from './entities/oauth-client.entity';
import {
  CreateClientRequestDto,
  CreateClientResponseDto,
} from './dto/create-client-request.dto';
import { AppException } from 'omniboxd/common/exceptions/app.exception';

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

    if (existingClient) {
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

  async findByClientId(clientId: string): Promise<OAuthClient | null> {
    return this.clientRepository.findOne({
      where: { clientId, isActive: true },
    });
  }

  async validateClient(
    clientId: string,
    clientSecret: string,
  ): Promise<OAuthClient> {
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

  validateRedirectUri(client: OAuthClient, redirectUri: string): boolean {
    return client.redirectUris.includes(redirectUri);
  }

  validateScopes(client: OAuthClient, requestedScopes: string[]): string[] {
    return requestedScopes.filter((scope) => client.scopes.includes(scope));
  }

  private generateClientSecret(): string {
    return `cs_${crypto.randomBytes(32).toString('hex')}`;
  }
}
