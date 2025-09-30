import { Controller } from '@nestjs/common';
import { UploadsService } from 'omniboxd/uploads/uploads.service';

@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}
}