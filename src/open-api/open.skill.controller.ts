import { Controller, Get, Header } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Public } from 'omniboxd/auth/decorators/public.auth.decorator';
import { SkipOpenAPIQuota } from 'omniboxd/open-api/open-api-quota.decorator';

const OPEN_API_BASE_URL_PLACEHOLDER = '${OBB_OPEN_API_BASE_URL}';
const DEFAULT_OPEN_API_BASE_URL = '/open/api';

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function readSkillTemplate(): string {
  return readFileSync(join(__dirname, 'templates/SKILL.md'), 'utf8');
}

@SkipOpenAPIQuota()
@Controller('open/api/v1')
export class OpenSkillController {
  private readonly renderedSkill: string;

  constructor(private readonly configService: ConfigService) {
    const template = readSkillTemplate();
    const openApiBaseUrl = trimTrailingSlash(
      this.configService.get<string>(
        'OBB_OPEN_API_BASE_URL',
        DEFAULT_OPEN_API_BASE_URL,
      ),
    );

    this.renderedSkill = template.replaceAll(
      OPEN_API_BASE_URL_PLACEHOLDER,
      openApiBaseUrl,
    );
  }

  @Get('SKILL.md')
  @Public()
  @Header('Content-Type', 'text/markdown; charset=utf-8')
  getSkill(): string {
    return this.renderedSkill;
  }
}
