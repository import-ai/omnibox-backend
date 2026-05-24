import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { UserId } from 'omniboxd/decorators/user-id.decorator';
import { ToolbarPreferenceResponseDto } from './dto/toolbar-preference-response.dto';
import { UpdateToolbarPreferenceDto } from './dto/update-toolbar-preference.dto';
import { ToolbarService } from './toolbar.service';

@Controller('api/v1/namespaces/:namespaceId/toolbar')
export class ToolbarController {
  constructor(private readonly toolbarService: ToolbarService) {}

  @Get('/sort/config')
  async getPreference(
    @Param('namespaceId') namespaceId: string,
    @UserId() userId: string,
  ): Promise<ToolbarPreferenceResponseDto> {
    const preference = await this.toolbarService.getPreference(
      namespaceId,
      userId,
    );
    return ToolbarPreferenceResponseDto.fromEntity(preference);
  }

  @Patch('/sort/config')
  async updatePreference(
    @Param('namespaceId') namespaceId: string,
    @UserId() userId: string,
    @Body() updatePreference: UpdateToolbarPreferenceDto,
  ): Promise<ToolbarPreferenceResponseDto> {
    const preference = await this.toolbarService.updatePreference(
      namespaceId,
      userId,
      updatePreference,
    );
    return ToolbarPreferenceResponseDto.fromEntity(preference);
  }
}
