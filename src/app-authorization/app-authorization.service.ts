import { Repository } from 'typeorm';
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AppAuthorization } from './app-authorization.entity';
import {
  AppAuthorizationResponseDto,
  CreateAppAuthorizationDto,
  UpdateAppAuthorizationDto,
} from './app-authorization.dto';
import { NamespacesService } from 'omniboxd/namespaces/namespaces.service';

@Injectable()
export class AppAuthorizationService {
  constructor(
    @InjectRepository(AppAuthorization)
    private readonly appAuthorizationRepository: Repository<AppAuthorization>,
    private readonly namespacesService: NamespacesService,
  ) {}

  async getAttrs(
    namespaceId: string,
    userId: string,
    createDto: CreateAppAuthorizationDto,
  ): Promise<Record<string, any>> {
    const attrs = createDto.attrs || {};

    if (createDto.app_id === 'wechat_bot') {
      const verifyCode = await this.generateUniqueVerifyCode();
      attrs.verify_code = verifyCode;
    }

    return attrs;
  }

  private async generateUniqueVerifyCode(): Promise<string> {
    let verifyCode = '';
    let attempts = 0;
    const maxAttempts = 100;

    while (attempts < maxAttempts) {
      verifyCode = Math.floor(100000 + Math.random() * 900000).toString();

      const existingAuths = await this.appAuthorizationRepository.find({
        where: { appId: 'wechat_bot' },
      });

      const codeExists = existingAuths.some(
        (auth) => auth.attrs?.verify_code === verifyCode,
      );

      if (!codeExists) {
        return verifyCode;
      }

      attempts++;
    }

    throw new Error(
      'Failed to generate unique verify code after maximum attempts',
    );
  }

  async create(
    namespaceId: string,
    userId: string,
    createDto: CreateAppAuthorizationDto,
  ): Promise<AppAuthorizationResponseDto> {
    await this.validateUserNamespacePermission(userId, namespaceId);

    const attrs = await this.getAttrs(namespaceId, userId, createDto);

    const appAuthorization = this.appAuthorizationRepository.create({
      namespaceId,
      userId: createDto.user_id,
      appId: createDto.app_id,
      apiKeyId: createDto.api_key_id || null,
      attrs,
    });

    const saved = await this.appAuthorizationRepository.save(appAuthorization);
    return this.toResponseDto(saved);
  }

  async findAll(
    namespaceId: string,
    userId: string,
    appId?: string,
    targetUserId?: string,
  ): Promise<AppAuthorizationResponseDto[]> {
    await this.validateUserNamespacePermission(userId, namespaceId);

    const where: any = { namespaceId };
    if (appId) where.appId = appId;
    if (targetUserId) where.userId = targetUserId;

    const authorizations = await this.appAuthorizationRepository.find({
      where,
    });
    return authorizations.map((auth) => this.toResponseDto(auth));
  }

  async findOne(
    id: string,
    userId: string,
  ): Promise<AppAuthorizationResponseDto> {
    const authorization = await this.appAuthorizationRepository.findOne({
      where: { id },
    });

    if (!authorization) {
      throw new NotFoundException('App authorization not found');
    }

    await this.validateUserNamespacePermission(
      userId,
      authorization.namespaceId,
    );
    return this.toResponseDto(authorization);
  }

  async update(
    id: string,
    userId: string,
    updateDto: UpdateAppAuthorizationDto,
  ): Promise<AppAuthorizationResponseDto> {
    const authorization = await this.appAuthorizationRepository.findOne({
      where: { id },
    });

    if (!authorization) {
      throw new NotFoundException('App authorization not found');
    }

    await this.validateUserNamespacePermission(
      userId,
      authorization.namespaceId,
    );

    const updateData: Partial<AppAuthorization> = {};
    if (updateDto.app_id !== undefined) updateData.appId = updateDto.app_id;
    if (updateDto.api_key_id !== undefined)
      updateData.apiKeyId = updateDto.api_key_id;
    if (updateDto.attrs !== undefined) updateData.attrs = updateDto.attrs;

    await this.appAuthorizationRepository.update(id, updateData);
    return await this.findOne(id, userId);
  }

  async delete(id: string, userId: string): Promise<void> {
    const authorization = await this.appAuthorizationRepository.findOne({
      where: { id },
    });

    if (!authorization) {
      throw new NotFoundException('App authorization not found');
    }

    await this.validateUserNamespacePermission(
      userId,
      authorization.namespaceId,
    );

    const result = await this.appAuthorizationRepository.delete(id);
    if ((result.affected || 0) === 0) {
      throw new NotFoundException('App authorization not found');
    }
  }

  private toResponseDto(
    authorization: AppAuthorization,
  ): AppAuthorizationResponseDto {
    return {
      id: authorization.id,
      namespace_id: authorization.namespaceId,
      user_id: authorization.userId,
      app_id: authorization.appId,
      api_key_id: authorization.apiKeyId,
      attrs: authorization.attrs,
      created_at: authorization.createdAt,
      updated_at: authorization.updatedAt,
    };
  }

  private async validateUserNamespacePermission(
    userId: string,
    namespaceId: string,
  ): Promise<void> {
    const member = await this.namespacesService.getMemberByUserId(
      namespaceId,
      userId,
    );

    if (!member) {
      throw new ForbiddenException(
        `User ${userId} does not have permission to namespace ${namespaceId}`,
      );
    }
  }
}
