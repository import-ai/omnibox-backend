import {
  Feedback,
  FeedbackType,
} from 'omniboxd/feedback/entities/feedback.entity';
import { BaseDto } from 'omniboxd/common/base.dto';

export class FeedbackResponseDto implements BaseDto {
  id: number;
  type: FeedbackType;
  description: string;
  image_url: string | null;
  contact_info: string | null;
  user_agent: string | null;
  user_id: string | null;

  created_at?: string;
  updated_at?: string;

  public static fromEntity(entity: Feedback): FeedbackResponseDto {
    const dto = new FeedbackResponseDto();
    dto.id = entity.id;
    dto.type = entity.type;
    dto.description = entity.description;
    dto.image_url = entity.imageUrl;
    dto.contact_info = entity.contactInfo;
    dto.user_agent = entity.userAgent;
    dto.user_id = entity.userId;
    dto.created_at = entity.createdAt.toISOString();
    dto.updated_at = entity.updatedAt.toISOString();
    return dto;
  }
}
