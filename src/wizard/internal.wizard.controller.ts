import { Response } from 'express';
import { WizardService } from 'omniboxd/wizard/wizard.service';
import { Public } from 'omniboxd/auth/decorators/public.auth.decorator';
import { transformKeysToSnakeCase } from 'omniboxd/interceptor/utils';
import { TaskCallbackDto } from 'omniboxd/wizard/dto/task-callback.dto';
import { ChunkCallbackDto } from 'omniboxd/wizard/dto/chunk-callback.dto';
import { ChunkManagerService } from 'omniboxd/wizard/chunk-manager.service';
import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import { FetchTaskRequest } from 'omniboxd/wizard/dto/fetch-task-request.dto';

@Controller('internal/api/v1/wizard')
export class InternalWizardController {
  constructor(
    private readonly wizardService: WizardService,
    private readonly chunkManagerService: ChunkManagerService,
  ) {}

  @Public()
  @Get('task')
  async fetchTask(
    @Res() res: Response,
    @Query() query: FetchTaskRequest,
  ): Promise<void> {
    const task = await this.wizardService.fetchTask(query);
    res.status(task ? 200 : 204).json(transformKeysToSnakeCase(task));
  }

  @Public()
  @Post('callback')
  async handleTaskCallback(
    @Body() taskCallback: TaskCallbackDto,
  ): Promise<Record<string, any>> {
    return await this.wizardService.taskDoneCallback(taskCallback);
  }

  @Public()
  @Post('tasks/:taskId/upload')
  async createTaskResult(@Param('taskId') taskId: string) {
    const url = await this.wizardService.createTaskUploadUrl(taskId);
    return { url };
  }

  @Public()
  @Post('tasks/:taskId/callback')
  async handleUploadedTaskCallback(@Param('taskId') taskId: string) {
    const url = await this.wizardService.createTaskUploadUrl(taskId);
    return { url };
  }

  @Public()
  @Post('callback/chunk')
  async handleChunkCallback(
    @Body() chunkCallback: ChunkCallbackDto,
  ): Promise<Record<string, any>> {
    const { id, chunk_index, total_chunks, data, is_final_chunk } =
      chunkCallback;

    // Store the chunk
    await this.chunkManagerService.storeChunk(
      id,
      chunk_index,
      total_chunks,
      data,
    );

    if (is_final_chunk) {
      try {
        // Assemble all chunks
        const assembledData = await this.chunkManagerService.assembleChunks(
          id,
          total_chunks,
        );

        // Parse the assembled data and call the regular callback
        const taskCallback: TaskCallbackDto = JSON.parse(assembledData);
        const result = await this.wizardService.taskDoneCallback(taskCallback);

        // Schedule cleanup
        this.chunkManagerService.cleanupChunks(id, total_chunks);

        return result;
      } catch (error) {
        // Clean up on error
        this.chunkManagerService.cleanupChunks(id, total_chunks);
        throw error;
      }
    }

    return { message: 'Chunk received', chunk_index, total_chunks };
  }
}
