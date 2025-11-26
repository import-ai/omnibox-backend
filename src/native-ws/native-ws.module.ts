import { Module } from '@nestjs/common';
import { NativeWsGateway } from 'omniboxd/native-ws/native-ws.gateway';
import { WizardModule } from 'omniboxd/wizard/wizard.module';
import { AuthModule } from 'omniboxd/auth';
import { SharesModule } from 'omniboxd/shares/shares.module';

@Module({
  imports: [WizardModule, AuthModule, SharesModule],
  providers: [NativeWsGateway],
  exports: [NativeWsGateway],
})
export class NativeWsModule {}
