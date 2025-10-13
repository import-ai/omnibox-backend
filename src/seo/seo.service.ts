import { Request } from 'express';
import { Repository } from 'typeorm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Share } from 'omniboxd/shares/entities/share.entity';
import { UserOption } from 'omniboxd/user/entities/user-option.entity';
import { generateHTML, loadHtmlTemplate } from 'omniboxd/seo/utils';
import { Resource } from 'omniboxd/resources/entities/resource.entity';

@Injectable()
export class SeoService {
  constructor(
    @InjectRepository(Share)
    private readonly shareRepository: Repository<Share>,
    @InjectRepository(Resource)
    private readonly resourceRepository: Repository<Resource>,
    @InjectRepository(UserOption)
    private readonly userOptionRepository: Repository<UserOption>,
  ) {}

  async generateShareHtml(
    shareId: string,
    resourceId: string | null,
    req: Request,
  ): Promise<string> {
    const share = await this.shareRepository.findOne({
      where: { id: shareId },
    });

    if (!share || !share.enabled) {
      return loadHtmlTemplate('No share found');
    }

    if (share.expiresAt && share.expiresAt < new Date()) {
      return loadHtmlTemplate('No share found');
    }

    if (share.requireLogin) {
      return loadHtmlTemplate('This share requires login');
    }

    if (share.password) {
      return loadHtmlTemplate('This content is password protected');
    }

    const targetResourceId = resourceId || share.resourceId;
    const resource = await this.resourceRepository.findOne({
      where: { id: targetResourceId },
      select: ['id', 'name', 'content', 'attrs'],
    });

    if (!resource) {
      return loadHtmlTemplate('Resource not found');
    }

    return generateHTML(resource, req);
  }

  async getResourceHtml(
    namespaceId: string,
    resourceId: string,
    req: Request,
  ): Promise<string> {
    const resource = await this.resourceRepository.findOne({
      where: { namespaceId, id: resourceId },
      select: ['id', 'name', 'content', 'userId'],
    });

    if (!resource) {
      return loadHtmlTemplate('Resource not found');
    }

    if (resource.userId) {
      const option = await this.userOptionRepository.findOne({
        where: { userId: resource.userId, name: 'indexed' },
      });
      if (option && option.value) {
        return generateHTML(resource, req);
      }
    }

    return loadHtmlTemplate('This content is protected');
  }
}
