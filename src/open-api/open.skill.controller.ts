import { Controller, Get, Header } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { Public } from 'omniboxd/auth/decorators/public.auth.decorator';

const OPEN_API_BASE_URL_PLACEHOLDER = '${OBB_OPEN_API_BASE_URL}';
const DEFAULT_OPEN_API_BASE_URL = '/open/api';

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

async function readSkillTemplate(): Promise<string> {
  const paths = [
    join(process.cwd(), 'open/api/v1/SKILL.md'),
    join(process.cwd(), 'dist/api/v1/SKILL.md'),
  ];

  for (const path of paths) {
    try {
      return await readFile(path, 'utf8');
    } catch {
      // Try the next candidate. The source path exists in development, while
      // the dist asset path exists in production Docker images.
    }
  }

  return await readFile(paths[0], 'utf8');
}

@Controller('open/api/v1')
export class OpenSkillController {
  constructor(private readonly configService: ConfigService) {}

  @Get('SKILL.md')
  @Public()
  @Header('Content-Type', 'text/markdown; charset=utf-8')
  async getSkill(): Promise<string> {
    const template = await readSkillTemplate();
    const openApiBaseUrl = trimTrailingSlash(
      this.configService.get<string>(
        'OBB_OPEN_API_BASE_URL',
        DEFAULT_OPEN_API_BASE_URL,
      ),
    );

    return template.replaceAll(OPEN_API_BASE_URL_PLACEHOLDER, openApiBaseUrl);
  }
}
