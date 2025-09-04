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
  private readonly apps: Record<string, BaseApp>;

  constructor(
    @InjectRepository(Applications)
    private readonly applicationsRepository: Repository<Applications>,
  ) {
    this.apps = {
      wechat_bot: new WechatBot(applicationsRepository),
    };
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
      userId: createDto.user_id,
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
  }
}
