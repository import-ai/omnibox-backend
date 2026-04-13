import { Module } from '@nestjs/common';
import { InternalVfsWizardController } from 'omniboxd/vfs-wizard/internal.vfs-wizard.controller';
import { VfsWizardService } from 'omniboxd/vfs-wizard/vfs-wizard.service';
import { VFSModule } from 'omniboxd/vfs/vfs.module';
import { WizardModule } from 'omniboxd/wizard/wizard.module';

@Module({
  providers: [VfsWizardService],
  controllers: [InternalVfsWizardController],
  imports: [VFSModule, WizardModule],
})
export class VfsWizardModule {}
