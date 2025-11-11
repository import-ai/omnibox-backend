import { OrdersService } from 'omniboxd/orders/orders.service';
import { UserId } from 'omniboxd/decorators/user-id.decorator';
import { QueryOrderDto } from 'omniboxd/orders/dto/query-order.dto';
import { Get, Param, Query, Controller } from '@nestjs/common';

@Controller('api/v1/orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  async findAll(@UserId() userId: string, @Query() query: QueryOrderDto) {
    return await this.ordersService.findAll(userId, query);
  }

  @Get(':id')
  async findById(@UserId() userId: string, @Param('id') id: string) {
    return await this.ordersService.findById(userId, id);
  }
}
