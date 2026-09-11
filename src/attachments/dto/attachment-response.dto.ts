import { ApiProperty } from '@nestjs/swagger';

export class AttachmentResponseDto {
  @ApiProperty({ description: 'Attachment ID' })
  id: string;

  @ApiProperty({ description: 'Original file name' })
  name: string;

  @ApiProperty({ description: 'Attachment MIME type', nullable: true })
  content_type: string | null;

  @ApiProperty({ description: 'Attachment size in bytes' })
  size: number;

  @ApiProperty({ description: 'Authenticated attachment download URL' })
  download_url: string;
}

export class AttachmentLlmUrlResponseDto {
  @ApiProperty({ description: 'Attachment ID' })
  id: string;

  @ApiProperty({ description: 'Original file name' })
  name: string;

  @ApiProperty({ description: 'Attachment MIME type', nullable: true })
  content_type: string | null;

  @ApiProperty({
    description:
      'Short-lived public download URL for the model. Null when no public S3 endpoint is configured.',
    nullable: true,
  })
  url: string | null;
}

export class ListAttachmentsResponseDto {
  @ApiProperty({ type: () => [AttachmentResponseDto] })
  attachments: AttachmentResponseDto[];

  @ApiProperty({ description: 'Total attachment count' })
  total: number;
}
