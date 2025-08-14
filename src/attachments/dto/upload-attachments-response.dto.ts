export class UploadedAttachmentDto {
  name: string;
  link: string;
}

export class UploadAttachmentsResponseDto {
  namespaceId: string;
  resourceId: string;
  uploaded: UploadedAttachmentDto[];
  failed: string[];
}
