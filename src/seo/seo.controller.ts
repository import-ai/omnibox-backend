import { Request, Response } from 'express';
import { SeoService } from 'omniboxd/seo/seo.service';
import { Controller, Get, Param, Req, Res } from '@nestjs/common';

@Controller('api/v1/seo')
export class SeoController {
  constructor(private readonly seoService: SeoService) {}

  @Get('shares/:shareId')
  async getShareSeoHtml(
    @Param('shareId') shareId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const html = await this.seoService.generateShareHtml(shareId, null, req);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300'); // Cache for 5 minutes
    res.send(html);
  }

  @Get('shares/:shareId/:resourceId')
  async getShareResourceSeoHtml(
    @Param('shareId') shareId: string,
    @Param('resourceId') resourceId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const html = await this.seoService.generateShareHtml(
      shareId,
      resourceId,
      req,
    );

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.send(html);
  }

  @Get('namespaces/:namespaceId/resources/:resourceId')
  async getResourceHtml(
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const html = await this.seoService.getResourceHtml(
      namespaceId,
      resourceId,
      req,
    );

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.send(html);
  }
}
