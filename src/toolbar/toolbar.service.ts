import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { PermissionsService } from 'omniboxd/permissions/permissions.service';
import {
  ToolbarPreference,
  ToolbarSortBy,
  ToolbarSortOrder,
} from 'omniboxd/toolbar/entities/toolbar.entity';
import { Repository } from 'typeorm';
import { UpdateToolbarPreferenceDto } from './dto/update-toolbar-preference.dto';
import { I18nService } from 'nestjs-i18n';

@Injectable()
export class ToolbarService {
  constructor(
    @InjectRepository(ToolbarPreference)
    private readonly toolbarRepository: Repository<ToolbarPreference>,
    private readonly permissionsService: PermissionsService,
    private readonly i18n: I18nService,
  ) {}

  async getPreference(
    namespaceId: string,
    userId: string,
  ): Promise<ToolbarPreference> {
    await this.assertUserInNamespace(namespaceId, userId);
    const preference = await this.toolbarRepository.findOne({
      where: {
        namespaceId,
        userId,
      },
    });
    if (preference) {
      return preference;
    }

    return await this.toolbarRepository.save(
      this.toolbarRepository.create({
        namespaceId,
        userId,
        sortBy: ToolbarSortBy.UPDATED_AT,
        sortOrder: ToolbarSortOrder.DESC,
      }),
    );
  }

  async updatePreference(
    namespaceId: string,
    userId: string,
    updatePreference: UpdateToolbarPreferenceDto,
  ): Promise<ToolbarPreference> {
    const preference = await this.getPreference(namespaceId, userId);
    return await this.toolbarRepository.save({
      ...preference,
      ...(updatePreference.sortBy !== undefined && {
        sortBy: updatePreference.sortBy,
      }),
      ...(updatePreference.sortOrder !== undefined && {
        sortOrder: updatePreference.sortOrder,
      }),
    });
  }

  private async assertUserInNamespace(namespaceId: string, userId: string) {
    const hasAccess = await this.permissionsService.userInNamespace(
      userId,
      namespaceId,
    );
    if (!hasAccess) {
      const message = this.i18n.t('auth.errors.notAuthorized');
      throw new AppException(message, 'NOT_AUTHORIZED', HttpStatus.FORBIDDEN);
    }
  }
}
