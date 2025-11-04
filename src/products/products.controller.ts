import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { ProductsService } from 'omniboxd/products/products.service';
import { CreateProductDto } from 'omniboxd/products/dto/create-product.dto';
import { UpdateProductDto } from 'omniboxd/products/dto/update-product.dto';
import { QueryProductDto } from 'omniboxd/products/dto/query-product.dto';

@Controller('api/v1/products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  async create(@Body() dto: CreateProductDto) {
    return await this.productsService.create(dto);
  }

  @Get()
  async findAll(@Query() query: QueryProductDto) {
    return await this.productsService.findAll(query);
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    return await this.productsService.findById(id);
  }

  @Get('code/:code')
  async findByCode(@Param('code') code: string) {
    return await this.productsService.findByCode(code);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return await this.productsService.update(id, dto);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    await this.productsService.delete(id);
    return { message: '产品已删除' };
  }
}
