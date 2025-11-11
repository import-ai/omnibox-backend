import { Controller, Get, Param, Query } from '@nestjs/common';
import { ProductsService } from 'omniboxd/products/products.service';
import { QueryProductDto } from 'omniboxd/products/dto/query-product.dto';

@Controller('api/v1/products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  async findAll(@Query() query: QueryProductDto) {
    return await this.productsService.findAll(query);
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    return await this.productsService.findById(id);
  }
}
