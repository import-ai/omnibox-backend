import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Resource } from 'omniboxd/resources/entities/resource.entity';
import { generateHTML, loadHtmlTemplate } from 'omniboxd/seo/utils';
import { Share } from 'omniboxd/shares/entities/share.entity';
import { UserOption } from 'omniboxd/user/entities/user-option.entity';
import { Repository } from 'typeorm';

export type SeoResponse = {
  html: string;
  status: HttpStatus;
};

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
  ): Promise<SeoResponse> {
    const share = await this.shareRepository.findOne({
      where: { id: shareId },
    });

    if (!share || !share.enabled) {
      return {
        html: loadHtmlTemplate('No share found'),
        status: HttpStatus.NOT_FOUND,
      };
    }

    if (share.expiresAt && share.expiresAt < new Date()) {
      return {
        html: loadHtmlTemplate('No share found'),
        status: HttpStatus.NOT_FOUND,
      };
    }

    if (share.requireLogin) {
      return {
        html: loadHtmlTemplate('This share requires login'),
        status: HttpStatus.OK,
      };
    }

    if (share.password) {
      return {
        html: loadHtmlTemplate('This content is password protected'),
        status: HttpStatus.OK,
      };
    }

    const targetResourceId = resourceId || share.resourceId;
    const resource = await this.resourceRepository.findOne({
      where: { id: targetResourceId },
      select: ['id', 'name', 'content', 'attrs'],
    });

    if (!resource) {
      return {
        html: loadHtmlTemplate('Resource not found'),
        status: HttpStatus.NOT_FOUND,
      };
    }

    const baseUrl = `${this.baseUrl}/s/${shareId}/${targetResourceId}`;

    return { html: generateHTML(baseUrl, resource), status: HttpStatus.OK };
  }

  async getResourceHtml(
    namespaceId: string,
    resourceId: string,
  ): Promise<SeoResponse> {
    const resource = await this.resourceRepository.findOne({
      where: { namespaceId, id: resourceId },
      select: ['id', 'name', 'content', 'userId'],
    });

    if (!resource) {
      return {
        html: loadHtmlTemplate('Resource not found'),
        status: HttpStatus.NOT_FOUND,
      };
    }

    if (resource.userId) {
      const option = await this.userOptionRepository.findOne({
        where: { userId: resource.userId, name: 'indexed' },
      });
      if (option && option.value) {
        const baseUrl = `${this.baseUrl}/${namespaceId}/${resourceId}`;

        return { html: generateHTML(baseUrl, resource), status: HttpStatus.OK };
      }
    }

    return {
      html: loadHtmlTemplate('This content is protected'),
      status: HttpStatus.OK,
    };
  }
}
