import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrdersController } from 'omniboxd/orders/orders.controller';
import { OrdersService } from 'omniboxd/orders/orders.service';
import { Order } from 'omniboxd/orders/entities/order.entity';
import { ProductsModule } from 'omniboxd/products/products.module';
@Module({
  imports: [TypeOrmModule.forFeature([Order]), ProductsModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
