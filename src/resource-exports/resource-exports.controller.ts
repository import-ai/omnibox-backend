import { Controller, Post, Get, Param, Delete } from '@nestjs/common';
import { ResourceExportsService } from './resource-exports.service';
import { ExportJobDto } from './dto/export-job.dto';
import { ExportDownloadDto } from './dto/export-download.dto';
import { UserId } from 'omniboxd/decorators/user-id.decorator';

@Controller('api/v1/namespaces/:namespaceId')
export class ResourceExportsController {
  constructor(
    private readonly resourceExportsService: ResourceExportsService,
  ) {}

  @Post('resources/:resourceId/export')
  async startExport(
    @UserId() userId: string,
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
  ): Promise<ExportJobDto> {
    return await this.resourceExportsService.createExportJob(
      namespaceId,
      resourceId,
      userId,
    );
  }

  @Get('exports/:jobId')
  async getExportStatus(
    @UserId() userId: string,
    @Param('namespaceId') namespaceId: string,
    @Param('jobId') jobId: string,
  ): Promise<ExportJobDto> {
    return await this.resourceExportsService.getExportJob(
      namespaceId,
      jobId,
      userId,
    );
  }

  @Get('exports/:jobId/download')
  async getDownloadUrl(
    @UserId() userId: string,
    @Param('namespaceId') namespaceId: string,
    @Param('jobId') jobId: string,
  ): Promise<ExportDownloadDto> {
    return await this.resourceExportsService.getDownloadUrl(
      namespaceId,
      jobId,
      userId,
    );
  }

  @Delete('exports/:jobId')
  async cancelExport(
    @UserId() userId: string,
    @Param('namespaceId') namespaceId: string,
    @Param('jobId') jobId: string,
  ): Promise<ExportJobDto> {
    return await this.resourceExportsService.cancelExportJob(
      namespaceId,
      jobId,
      userId,
    );
  }
}
