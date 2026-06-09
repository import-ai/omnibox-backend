import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from 'omniboxd/auth';
import { WsSpanInterceptor } from 'omniboxd/interceptor/ws-span.interceptor';
import { SharesModule } from 'omniboxd/shares/shares.module';
import { User } from 'omniboxd/user/entities/user.entity';
import { WizardGateway } from 'omniboxd/websocket/wizard.gateway';
import { WsJwtGuard } from 'omniboxd/websocket/ws-jwt.guard';
import { WizardModule } from 'omniboxd/wizard/wizard.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    WizardModule,
    AuthModule,
    SharesModule,
  ],
  providers: [WizardGateway, WsJwtGuard, WsSpanInterceptor],
  exports: [WizardGateway, WsJwtGuard],
})
export class WebSocketModule {}
