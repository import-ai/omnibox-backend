import { Module } from '@nestjs/common';
import { WizardGateway } from 'omniboxd/websocket/wizard.gateway';
import { WsJwtGuard } from 'omniboxd/websocket/ws-jwt.guard';
import { WizardModule } from 'omniboxd/wizard/wizard.module';
import { AuthModule } from 'omniboxd/auth';

@Module({
  imports: [WizardModule, AuthModule],
  providers: [WizardGateway, WsJwtGuard],
  exports: [WizardGateway, WsJwtGuard],
})
export class WebSocketModule {}
