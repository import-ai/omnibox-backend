import { Expose } from 'class-transformer';
import {
  ToolbarPreference,
  ToolbarSortBy,
  ToolbarSortOrder,
} from 'omniboxd/toolbar/entities/toolbar.entity';

export class ToolbarPreferenceResponseDto {
  @Expose()
  id: string;

  @Expose({ name: 'namespace_id' })
  namespaceId: string;

  @Expose({ name: 'user_id' })
  userId: string;

  @Expose({ name: 'sort_by' })
  sortBy: ToolbarSortBy;

  @Expose({ name: 'sort_order' })
  sortOrder: ToolbarSortOrder;

  static fromEntity(
    preference: ToolbarPreference,
  ): ToolbarPreferenceResponseDto {
    const dto = new ToolbarPreferenceResponseDto();
    dto.id = preference.id;
    dto.namespaceId = preference.namespaceId;
    dto.userId = preference.userId;
    dto.sortBy = preference.sortBy;
    dto.sortOrder = preference.sortOrder;
    return dto;
  }
}
