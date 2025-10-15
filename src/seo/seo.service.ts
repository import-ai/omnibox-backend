import { Repository } from 'typeorm';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Share } from 'omniboxd/shares/entities/share.entity';
import { UserOption } from 'omniboxd/user/entities/user-option.entity';
import { generateHTML, loadHtmlTemplate } from 'omniboxd/seo/utils';
import { Resource } from 'omniboxd/resources/entities/resource.entity';

@Injectable()
export class SeoService {
  private readonly baseUrl: string;

  constructor(
    @InjectRepository(Share)
    private readonly shareRepository: Repository<Share>,
    @InjectRepository(Resource)
    private readonly resourceRepository: Repository<Resource>,
    @InjectRepository(UserOption)
    private readonly userOptionRepository: Repository<UserOption>,
    private readonly configService: ConfigService,
  ) {
    this.baseUrl = this.configService.get<string>(
      'OBB_BASE_URL',
      'https://www.omnibox.pro',
    );
  }

  async generateShareHtml(
    shareId: string,
    resourceId: string | null,
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

    const baseUrl = `${this.baseUrl}/s/${shareId}/${targetResourceId}`;

    return generateHTML(baseUrl, resource);
  }

  async getResourceHtml(
    namespaceId: string,
    resourceId: string,
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
        const baseUrl = `${this.baseUrl}/${namespaceId}/${resourceId}`;

        return generateHTML(baseUrl, resource);
      }
    }

    return loadHtmlTemplate('This content is protected');
  }
}
