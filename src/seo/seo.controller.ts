import { Controller, Get, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import { Public } from 'omniboxd/auth/decorators/public.auth.decorator';
import { SeoResponse, SeoService } from 'omniboxd/seo/seo.service';

@Public()
@Controller('api/v1/seo')
export class SeoController {
  constructor(private readonly seoService: SeoService) {}

  private send(res: Response, response: SeoResponse) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300'); // Cache for 5 minutes
    res.status(response.status).send(response.html);
  }

  @Get('shares/:shareId')
  async getShareSeoHtml(
    @Param('shareId') shareId: string,
    @Res() res: Response,
  ) {
    const response = await this.seoService.generateShareHtml(shareId, null);
    this.send(res, response);
  }

  @Get('shares/:shareId/:resourceId')
  async getShareResourceSeoHtml(
    @Param('shareId') shareId: string,
    @Param('resourceId') resourceId: string,
    @Res() res: Response,
  ) {
    const response = await this.seoService.generateShareHtml(
      shareId,
      resourceId,
    );
    this.send(res, response);
  }

  @Get('namespaces/:namespaceId/resources/:resourceId')
  async getResourceHtml(
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
    @Res() res: Response,
  ) {
    const response = await this.seoService.getResourceHtml(
      namespaceId,
      resourceId,
    );
    this.send(res, response);
  }
}
