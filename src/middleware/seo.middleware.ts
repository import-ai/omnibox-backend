import { isbot } from 'isbot';
import * as ejs from 'ejs';
import * as path from 'path';
import { Request, Response, NextFunction } from 'express';
import { Injectable, NestMiddleware } from '@nestjs/common';
import { ResourcesService } from 'omniboxd/resources/resources.service';

@Injectable()
export class SeoMiddleware implements NestMiddleware {
  constructor(private readonly resourcesService: ResourcesService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const userAgent = req.headers['user-agent'] || '';

    if (!isbot(userAgent)) {
      return next();
    }

    const parts = req.baseUrl.split('/').filter(Boolean);

    if (parts.length < 2) {
      return next();
    }

    let templatePath = '';
    const data: {
      error: string;
      title: string;
      description: string;
    } = {
      error: '',
      title: '',
      description: '',
    };
    try {
      templatePath = path.resolve(__dirname, '../views/page.ejs');

      if (parts.length === 2 && parts[1] !== 'chat') {
        // case 1: /:namespaceId/:resourceId
        const resource = await this.resourcesService.get(parts[1]);
        data.title = resource.name || 'Untitled';
        data.description = resource.content.substring(0, 160);
      } else if (
        parts.length === 3 &&
        parts[1] === 'chat' &&
        parts[2] === 'conversations'
      ) {
        // case 2: /:namespaceId/chat/conversations
        data.title = 'Conversation History';
        data.description = 'All conversation history management pages';
      } else if (parts.length === 2 && parts[1] === 'chat') {
        // case 3: /:namespaceId/chat
        data.title = 'Chat';
        data.description = 'New conversation';
      } else {
        return next();
      }
    } catch (error) {
      data.title = 'Error';
      data.error = error.message;
      templatePath = path.resolve(__dirname, '../views/error.ejs');
    }
    const page = await ejs.renderFile(templatePath, data);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(page);
  }
}
