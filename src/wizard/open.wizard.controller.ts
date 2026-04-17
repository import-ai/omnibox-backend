import {
  Body,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { RequestId } from 'omniboxd/decorators/request-id.decorators';
import { WizardService } from 'omniboxd/wizard/wizard.service';
import { CompressedCollectRequestDto } from 'omniboxd/wizard/dto/collect-request.dto';
import { CollectResponseDto } from 'omniboxd/wizard/dto/collect-response.dto';
import {
  CollectUrlResponseDto,
  OpenCollectUrlRequestDto,
} from 'omniboxd/wizard/dto/collect-url-request.dto';
import { UserId } from 'omniboxd/decorators/user-id.decorator';
import { APIKey, APIKeyAuth } from 'omniboxd/auth/decorators';
import {
  APIKey as APIKeyEntity,
  APIKeyPermissionTarget,
  APIKeyPermissionType,
} from 'omniboxd/api-key/api-key.entity';
import { OpenCollectRequestDto } from 'omniboxd/wizard/dto/open-collect-request.dto';
import { OpenAgentRequestDto } from 'omniboxd/wizard/dto/open-agent-request.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { OpenWizardService } from 'omniboxd/wizard/open.wizard.service';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { CheckNamespaceReadonly } from 'omniboxd/namespaces/decorators/check-storage-quota.decorator';

@ApiTags('Wizard')
@ApiSecurity('api-key')
@Controller('open/api/v1/wizard')
export class OpenWizardController {
  constructor(
    private readonly wizardService: WizardService,
    private readonly openWizardService: OpenWizardService,
  ) {}

  @Post('collect/gzip')
  @CheckNamespaceReadonly()
  @APIKeyAuth({
    permissions: [
      {
        target: APIKeyPermissionTarget.RESOURCES,
        permissions: [APIKeyPermissionType.CREATE],
      },
    ],
  })
  @UseInterceptors(FileInterceptor('html'))
  @ApiOperation({
    summary: 'Collect web content and create a resource',
    description: `Collects and saves a web page by uploading its HTML content along with metadata.

## Example

\`\`\`bash
# First, create a gzip-compressed HTML file
echo '<html><body>Page content</body></html>' | gzip > /tmp/html.gz

# Then, make the API request
curl -X POST 'https://api.omnibox.pro/v1/wizard/collect' \\
  -H 'Authorization: Bearer your-api-key' \\
  -F 'url=https://example.com/page' \\
  -F 'title=Example Page' \\
  -F 'html=@/tmp/html.gz;type=application/gzip;filename=html.gz'
\`\`\`
`,
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Web content collection request with compressed HTML',
    type: OpenCollectRequestDto,
  })
  @ApiResponse({
    status: 201,
    description: 'Web content collected successfully',
    type: CollectResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid or missing API key' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async collect(
    @APIKey() apiKey: APIKeyEntity,
    @UserId() userId: string,
    @Body() data: OpenCollectRequestDto,
    @UploadedFile() compressedHtml: Express.Multer.File,
  ): Promise<CollectResponseDto> {
    return await this.wizardService.compressedCollect(
      apiKey.namespaceId,
      userId,
      {
        url: data.url,
        title: data.title,
        parentId: data.parentId || apiKey.attrs.root_resource_id,
      } as CompressedCollectRequestDto,
      compressedHtml,
    );
  }

  @Post('ask')
  @CheckNamespaceReadonly()
  @APIKeyAuth({
    permissions: [
      {
        target: APIKeyPermissionTarget.CHAT,
        permissions: [APIKeyPermissionType.CREATE],
      },
    ],
  })
  @ApiOperation({ summary: 'Ask a question to the AI wizard/assistant' })
  @ApiBody({
    description: 'Question and context for the AI assistant',
    type: OpenAgentRequestDto,
  })
  @ApiResponse({
    status: 201,
    description: 'Question answered successfully',
  })
  @ApiResponse({ status: 401, description: 'Invalid or missing API key' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async ask(
    @APIKey() apiKey: APIKeyEntity,
    @UserId() userId: string,
    @RequestId() requestId: string,
    @Body() data: OpenAgentRequestDto,
  ): Promise<any> {
    return await this.openWizardService.ask(
      userId,
      apiKey.namespaceId,
      requestId,
      data,
    );
  }

  @Post('collect/url')
  @CheckNamespaceReadonly()
  @APIKeyAuth({
    permissions: [
      {
        target: APIKeyPermissionTarget.RESOURCES,
        permissions: [APIKeyPermissionType.CREATE],
      },
    ],
  })
  @ApiOperation({ summary: 'Collect content from a URL' })
  @ApiBody({
    description: 'URL to collect content from',
    type: OpenCollectUrlRequestDto,
  })
  @ApiResponse({
    status: 201,
    description: 'URL collection task created successfully',
    type: CollectUrlResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid or missing API key' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async collectUrl(
    @APIKey() apiKey: APIKeyEntity,
    @UserId() userId: string,
    @Body() data: OpenCollectUrlRequestDto,
  ): Promise<CollectUrlResponseDto> {
    return await this.wizardService.collectUrl(
      apiKey.namespaceId,
      userId,
      data.url,
      data.parentId || apiKey.attrs.root_resource_id,
    );
  }
}
