import { Body, Controller, Post } from '@nestjs/common';
import { FilesService } from './files.service';
import { CreateFileReqDto } from './dtos/create-file-req.dto';

@Controller('api/v1/files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post()
  async createFile(@Body() createFileReq: CreateFileReqDto) {
    return await this.filesService.createFile(createFileReq.sha256);
  }
}
