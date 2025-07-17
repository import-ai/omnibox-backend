import { Response } from 'express';
import { ResourcesService } from 'src/resources/resources.service';
import { Resource } from 'src/resources/resources.entity';

export async function fileResponse(
  resourceId: string,
  response: Response,
  resourcesService: ResourcesService,
) {
  const { fileStream, resource } =
    await resourcesService.downloadFile(resourceId);
  const encodedName = encodeURIComponent(resource.name);
  response.setHeader(
    'Content-Disposition',
    `attachment; filename="${encodedName}"`,
  );
  response.setHeader(
    'Content-Type',
    resource.attrs?.mimetype || 'application/octet-stream',
  );
  fileStream.pipe(response);
}

export function embedImage(resource: Resource): Resource {
  // TODO load image from S3
  if (resource.attrs?.images) {
    let content: string = resource.content;
    const images: Record<string, string> = resource.attrs?.images || {};
    for (const [key, value] of Object.entries(images)) {
      content = content.replaceAll(
        `(${key})`,
        `(data:image/jpeg;base64,${value})`,
      );
    }
    return { ...resource, content };
  }
  return resource;
}
