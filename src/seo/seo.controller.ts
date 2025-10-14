import { Request, Response } from 'express';
import { SeoService } from 'omniboxd/seo/seo.service';
import { Controller, Get, Param, Req, Res } from '@nestjs/common';
import { Public } from 'omniboxd/auth/decorators/public.auth.decorator';

@Public()
@Controller('api/v1/seo')
export class SeoController {
  constructor(private readonly seoService: SeoService) {}

  private send(res: Response, html: string) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300'); // Cache for 5 minutes
    res.send(html);
  }

  @Get('shares/:shareId')
  async getShareSeoHtml(
    @Param('shareId') shareId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const html = await this.seoService.generateShareHtml(shareId, null, req);
    this.send(res, html);
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
    this.send(res, html);
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
    this.send(res, html);
  }
}
