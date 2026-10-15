import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import {
  parseInstallationId,
  runWithClientContext,
} from 'omniboxd/common/client-context';

@Injectable()
export class ClientContextMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    const installationId = parseInstallationId(
      req.headers['x-installation-id'],
    );
    runWithClientContext({ installationId }, () => next());
  }
}
