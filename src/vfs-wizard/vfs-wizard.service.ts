import { Injectable } from '@nestjs/common';
import { VfsService } from 'omniboxd/vfs/vfs.service';
import { WizardService } from 'omniboxd/wizard/wizard.service';

@Injectable()
export class VfsWizardService {
  constructor(
    private readonly wizardService: WizardService,
    private readonly vfsService: VfsService,
  ) {}

  async collectUrl(
    namespaceId: string,
    userId: string,
    parentPath: string,
    url: string,
  ) {
    const { fileInfo } = await this.vfsService.getFileInfoDtoByPath(
      namespaceId,
      userId,
      parentPath,
    );
    return await this.wizardService.collectUrl(
      namespaceId,
      userId,
      url,
      fileInfo.id,
    );
  }
}
