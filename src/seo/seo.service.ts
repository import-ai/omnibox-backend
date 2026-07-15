import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { Resource } from 'omniboxd/resources/entities/resource.entity';
import { generateHTML, loadHtmlTemplate } from 'omniboxd/seo/utils';
import { SharedResourcesService } from 'omniboxd/shared-resources/shared-resources.service';
import { Share } from 'omniboxd/shares/entities/share.entity';
import { UserOption } from 'omniboxd/user/entities/user-option.entity';
import { Repository } from 'typeorm';

export type SeoResponse = {
  html: string;
  status: HttpStatus;
};

function response(html: string, status = HttpStatus.OK): SeoResponse {
  return { html, status };
}

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
    private readonly sharedResourcesService: SharedResourcesService,
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

    if (
      !share ||
      !share.enabled ||
      !share.userId ||
      (share.expiresAt && share.expiresAt < new Date())
    ) {
      return response(loadHtmlTemplate('No share found'), HttpStatus.NOT_FOUND);
    }

    if (share.requireLogin) {
      return response(loadHtmlTemplate('This share requires login'));
    }

    if (share.password) {
      return response(loadHtmlTemplate('This content is password protected'));
    }

    const targetResourceId = resourceId || share.resourceId;
    let resource: Resource;
    try {
      resource = await this.sharedResourcesService.getAndValidateResource(
        share,
        targetResourceId,
      );
    } catch (error) {
      if (error instanceof AppException && error.getStatus() === 404) {
        return response(
          loadHtmlTemplate('Resource not found'),
          HttpStatus.NOT_FOUND,
        );
      }
      throw error;
    }

    const baseUrl = `${this.baseUrl}/s/${shareId}/${targetResourceId}`;

    return response(generateHTML(baseUrl, resource));
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
      return response(
        loadHtmlTemplate('Resource not found'),
        HttpStatus.NOT_FOUND,
      );
    }

    if (resource.userId) {
      const option = await this.userOptionRepository.findOne({
        where: { userId: resource.userId, name: 'indexed' },
      });
      if (option?.value === 'true') {
        const baseUrl = `${this.baseUrl}/${namespaceId}/${resourceId}`;

        return response(generateHTML(baseUrl, resource));
      }
    }

    return response(loadHtmlTemplate('This content is protected'));
  }
}
