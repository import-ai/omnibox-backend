import { Module } from '@nestjs/common';
import { WizardGateway } from 'omniboxd/websocket/wizard.gateway';
import { WsJwtGuard } from 'omniboxd/websocket/ws-jwt.guard';
import { WizardModule } from 'omniboxd/wizard/wizard.module';
import { AuthModule } from 'omniboxd/auth';
import { SharesModule } from 'omniboxd/shares/shares.module';

@Module({
  imports: [WizardModule, AuthModule, SharesModule],
  providers: [WizardGateway, WsJwtGuard],
  exports: [WizardGateway, WsJwtGuard],
})
export class WebSocketModule {}
