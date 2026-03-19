import { Repository } from 'typeorm';
import { Injectable, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { I18nService } from 'nestjs-i18n';
import { Applications } from './applications.entity';
import {
  ApplicationsResponseDto,
  CreateApplicationsDto,
} from './applications.dto';
import { BaseApp } from 'omniboxd/applications/apps/base-app';
import { WechatBot } from 'omniboxd/applications/apps/wechat-bot';
import { QQBot } from 'omniboxd/applications/apps/qq-bot';

export interface FindAllOptions {
  apiKeyId?: string;
}

@Injectable()
export class ApplicationsService {
  private readonly apps: Record<string, BaseApp> = {};

  constructor(
    @InjectRepository(Applications)
    private readonly applicationsRepository: Repository<Applications>,
    private readonly wechatBot: WechatBot,
    private readonly qqBot: QQBot,
    private readonly i18n: I18nService,
    private readonly configService: ConfigService,
  ) {
    const enabledApps = this.configService.get<string>(
      'OBB_ENABLED_APPLICATIONS',
    );
    const enabledAppIds =
      enabledApps === undefined
        ? null
        : enabledApps
            .split(',')
            .map((id) => id.trim())
            .filter((id) => id.length > 0);

    if (this.isAppEnabled(WechatBot.appId, enabledAppIds)) {
      this.apps[WechatBot.appId] = this.wechatBot;
    }
    if (this.isAppEnabled(QQBot.appId, enabledAppIds)) {
      this.apps[QQBot.appId] = this.qqBot;
    }
  }

  private isAppEnabled(appId: string, enabledAppIds: string[] | null): boolean {
    // If config is not set (undefined), all apps are enabled by default
    // If config is set to empty string, no apps are enabled
    if (enabledAppIds === null) {
      return true;
    }
    return enabledAppIds.includes(appId);
  }

  async findOne(
    id: string,
    namespaceId: string,
    userId: string,
  ): Promise<ApplicationsResponseDto> {
    const entity = await this.applicationsRepository.findOne({
      where: { id, namespaceId, userId },
    });

    if (!entity) {
      const message = this.i18n.t('application.errors.appAuthNotFound');
      throw new AppException(
        message,
        'APP_AUTHORIZATION_NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    }

    return ApplicationsResponseDto.fromEntity(entity);
  }

  async findAll(
    namespaceId: string,
    userId: string,
    options?: FindAllOptions,
  ): Promise<ApplicationsResponseDto[]> {
    const where: any = { namespaceId, userId };
    if (options?.apiKeyId) {
      where.apiKeyId = options.apiKeyId;
    }
    const entities = await this.applicationsRepository.find({ where });
    const applications: ApplicationsResponseDto[] = [];

    // If filtering by apiKeyId, only return actual database entities
    if (options?.apiKeyId) {
      for (const entity of entities) {
        applications.push(ApplicationsResponseDto.fromEntity(entity));
      }
    } else {
      // If not filtering, show all available apps (with or without instances)
      for (const appId of Object.keys(this.apps)) {
        const existingApp = entities.find((app) => app.appId === appId);
        if (existingApp) {
          applications.push(ApplicationsResponseDto.fromEntity(existingApp));
        } else {
          const app = new ApplicationsResponseDto();
          app.app_id = appId;
          applications.push(app);
        }
      }
    }

    return applications;
  }

  async create(
    appId: string,
    namespaceId: string,
    userId: string,
    createDto: CreateApplicationsDto,
  ): Promise<ApplicationsResponseDto> {
    if (!this.apps[appId]) {
      const message = this.i18n.t('application.errors.appNotFound', {
        args: { appId },
      });
      throw new AppException(message, 'APP_NOT_FOUND', HttpStatus.NOT_FOUND);
    }

    const attrs = await this.apps[appId].getAttrs(
      namespaceId,
      userId,
      createDto,
    );

    const applications = this.applicationsRepository.create({
      namespaceId,
      userId,
      appId,
      apiKeyId: createDto.api_key_id || null,
      attrs,
    });

    const saved = await this.applicationsRepository.save(applications);
    return ApplicationsResponseDto.fromEntity(saved);
  }

  async callback(appId: string, data: Record<string, any>) {
    return await this.apps[appId].callback(data);
  }

  async delete(id: string, namespaceId: string, userId: string): Promise<void> {
    const authorization = await this.applicationsRepository.findOne({
      where: { id, userId, namespaceId },
    });

    if (!authorization) {
      const message = this.i18n.t('application.errors.appAuthNotFound');
      throw new AppException(
        message,
        'APP_AUTHORIZATION_NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    }

    const result = await this.applicationsRepository.softDelete({
      id,
      userId,
      namespaceId,
    });
    if ((result.affected || 0) === 0) {
      const message = this.i18n.t('application.errors.appAuthNotFound');
      throw new AppException(
        message,
        'APP_AUTHORIZATION_NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    }

    // Call postDelete hook after soft delete
    const app = this.apps[authorization.appId];
    if (app?.postDelete) {
      await app.postDelete(authorization);
    }
  }
}
