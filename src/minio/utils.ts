import { GetResponse as ObjectResponse } from 'omniboxd/minio/minio.service';
import { Response } from 'express';

export function objectStreamResponse(
  objectResponse: ObjectResponse,
  httpResponse: Response,
  options: {
    cacheControl?: boolean;
    forceDownload?: boolean;
  } = {},
) {
  const cacheControl = options.cacheControl ?? true;
  const forceDownload = options.forceDownload ?? true;
  const { stream, filename, mimetype, stat } = objectResponse;
  const encodedName = encodeURIComponent(filename);
  const disposition = forceDownload ? 'attachment' : 'inline';
  const headers = {
    'Content-Length': stat.size,
    'Last-Modified': stat.lastModified.toUTCString(),
    'Content-Disposition': `${disposition}; filename="${encodedName}"`,
    'Content-Type': mimetype,
  };
  if (cacheControl) {
    headers['Cache-Control'] = 'public, max-age=31536000'; // 1 year
  } else {
    headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
  }
  for (const [key, value] of Object.entries(headers)) {
    httpResponse.setHeader(key, value);
  }
  stream.pipe(httpResponse);
}
