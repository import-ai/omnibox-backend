import { Response } from 'express';
import { ResourcesService } from 'src/resources/resources.service';

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
