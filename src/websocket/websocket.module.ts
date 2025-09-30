import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { WizardGateway } from 'omniboxd/websocket/wizard.gateway';
import { WsJwtGuard } from 'omniboxd/websocket/ws-jwt.guard';
import { UserModule } from 'omniboxd/user/user.module';
import { WizardModule } from 'omniboxd/wizard/wizard.module';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get('OBB_JWT_SECRET'),
        signOptions: { expiresIn: config.get('OBB_JWT_EXPIRE', '2678400s') },
      }),
    }),
    UserModule,
    forwardRef(() => WizardModule),
  ],
  providers: [WizardGateway, WsJwtGuard],
  exports: [WizardGateway, WsJwtGuard],
})
export class WebSocketModule {}
