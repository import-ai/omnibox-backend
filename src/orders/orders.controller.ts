import { OrdersService } from 'omniboxd/orders/orders.service';
import { UserId } from 'omniboxd/decorators/user-id.decorator';
import { Get, Param, Controller } from '@nestjs/common';

@Controller('api/v1/orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get(':id')
  async getById(@UserId() userId: string, @Param('id') id: string) {
    return await this.ordersService.findById(userId, id);
  }
}
