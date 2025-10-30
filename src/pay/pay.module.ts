import { Module } from '@nestjs/common';
import { PayController } from 'omniboxd/pay/pay.controller';
import { PayService } from 'omniboxd/pay/pay.service';

@Module({
  controllers: [PayController],
  providers: [PayService],
  exports: [PayService],
})
export class PayModule {}
