import { Module } from '@nestjs/common';
import { InternalVfsWizardController } from 'omniboxd/vfs-wizard/internal.vfs-wizard.controller';
import { VfsWizardService } from 'omniboxd/vfs-wizard/vfs-wizard.service';
import { VfsModule } from 'omniboxd/vfs/vfs.module';
import { WizardModule } from 'omniboxd/wizard/wizard.module';
import { NamespacesQuotaModule } from 'omniboxd/namespaces/namespaces-quota.module';

@Module({
  providers: [VfsWizardService],
  controllers: [InternalVfsWizardController],
  imports: [VfsModule, WizardModule, NamespacesQuotaModule],
})
export class VfsWizardModule {}
