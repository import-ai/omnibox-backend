import { Response } from 'express';
import { WizardService } from 'omniboxd/wizard/wizard.service';
import { Public } from 'omniboxd/auth/decorators/public.auth.decorator';
import { transformKeysToSnakeCase } from 'omniboxd/interceptor/utils';
import { TaskCallbackDto } from 'omniboxd/wizard/dto/task-callback.dto';
import { Body, Controller, Get, Post, Res } from '@nestjs/common';

@Controller('internal/api/v1/wizard')
export class InternalWizardController {
  constructor(private readonly wizardService: WizardService) {}

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
}
