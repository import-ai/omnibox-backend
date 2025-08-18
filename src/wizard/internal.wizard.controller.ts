import { Response } from 'express';
import { WizardService } from 'omniboxd/wizard/wizard.service';
import { Public } from 'omniboxd/auth/decorators/public.auth.decorator';
import { transformKeysToSnakeCase } from 'omniboxd/interceptor/utils';
import { TaskCallbackDto } from 'omniboxd/wizard/dto/task-callback.dto';
import { ChunkCallbackDto } from 'omniboxd/wizard/dto/chunk-callback.dto';
import { ChunkManagerService } from 'omniboxd/wizard/chunk-manager.service';
import { Body, Controller, Get, Post, Res } from '@nestjs/common';

@Controller('internal/api/v1/wizard')
export class InternalWizardController {
  constructor(
    private readonly wizardService: WizardService,
    private readonly chunkManagerService: ChunkManagerService,
  ) {}

  @Public()
  @Get('/task')
  async fetchTask(@Res() res: Response): Promise<void> {
    const task = await this.wizardService.fetchTask();
    res.status(task ? 200 : 204).json(transformKeysToSnakeCase(task));
  }

  @Public()
  @Post('/callback')
  async handleTaskCallback(
    @Body() taskCallback: TaskCallbackDto,
  ): Promise<Record<string, any>> {
    return await this.wizardService.taskDoneCallback(taskCallback);
  }

  @Public()
  @Post('/callback/chunk')
  async handleChunkCallback(
    @Body() chunkCallback: ChunkCallbackDto,
  ): Promise<Record<string, any>> {
    const { id, chunkIndex, totalChunks, data, isFinalChunk } = chunkCallback;

    // Store the chunk
    await this.chunkManagerService.storeChunk(
      id,
      chunkIndex,
      totalChunks,
      data,
    );

    if (isFinalChunk) {
      try {
        // Assemble all chunks
        const assembledData = await this.chunkManagerService.assembleChunks(
          id,
          totalChunks,
        );

        // Parse the assembled data and call the regular callback
        const taskCallback: TaskCallbackDto = JSON.parse(assembledData);
        const result = await this.wizardService.taskDoneCallback(taskCallback);

        // Schedule cleanup
        this.chunkManagerService.cleanupChunks(id, totalChunks);

        return result;
      } catch (error) {
        // Clean up on error
        this.chunkManagerService.cleanupChunks(id, totalChunks);
        throw error;
      }
    }

    return { message: 'Chunk received', chunkIndex, totalChunks };
  }
}
