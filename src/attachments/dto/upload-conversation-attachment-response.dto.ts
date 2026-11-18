import { ApiProperty } from '@nestjs/swagger';

export class UploadConversationAttachmentResponseDto {
  @ApiProperty({ description: 'Conversation attachment ID' })
  attachment_id: string;

  @ApiProperty({ description: 'Original file name' })
  name: string;

  @ApiProperty({
    description: 'Authenticated attachment preview URL (relative)',
  })
  preview_url: string;
}
