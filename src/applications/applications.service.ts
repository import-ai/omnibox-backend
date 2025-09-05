import { Repository } from 'typeorm';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Applications } from './applications.entity';
import {
  ApplicationsResponseDto,
  CreateApplicationsDto,
} from './applications.dto';
import { BaseApp } from 'omniboxd/applications/apps/base-app';
import { WechatBot } from 'omniboxd/applications/apps/wechat-bot';

@Injectable()
export class ApplicationsService {
  private readonly apps: Record<string, BaseApp> = {};

  constructor(
    @InjectRepository(Applications)
    private readonly applicationsRepository: Repository<Applications>,
    private readonly wechatBot: WechatBot,
  ) {
    this.apps[WechatBot.appId] = this.wechatBot;
  }

  async findOne(
    appId: string,
    namespaceId: string,
    userId: string,
  ): Promise<ApplicationsResponseDto> {
    const entity = await this.applicationsRepository.findOne({
      where: { appId, namespaceId, userId },
    });

    if (!entity) {
      throw new NotFoundException('App authorization not found');
    }

    return ApplicationsResponseDto.fromEntity(entity);
  }

  async findAll(
    namespaceId: string,
    userId: string,
  ): Promise<ApplicationsResponseDto[]> {
    const entities = await this.applicationsRepository.find({
      where: { namespaceId, userId },
    });

    const applications: ApplicationsResponseDto[] = [];
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

    return applications;
  }

  async create(
    appId: string,
    namespaceId: string,
    userId: string,
    createDto: CreateApplicationsDto,
  ): Promise<ApplicationsResponseDto> {
    if (!this.apps[appId]) {
      throw new NotFoundException(`App ${appId} not found`);
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
      throw new NotFoundException('App authorization not found');
    }

    const result = await this.applicationsRepository.delete(id);
    if ((result.affected || 0) === 0) {
      throw new NotFoundException('App authorization not found');
    }

    // Call postDelete hook if the app supports it
    const app = this.apps[authorization.appId];
    if (app?.postDelete) {
      await app.postDelete(authorization);
    }
  }
}
