import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';
// import { Injectable, HttpStatus } from '@nestjs/common';
// import { AppException } from 'omniboxd/common/exceptions/app.exception';
import {
  Product,
  ProductStatus,
  ProductType,
} from 'omniboxd/products/entities/product.entity';
import { QueryProductDto } from 'omniboxd/products/dto/query-product.dto';
import { I18nService } from 'nestjs-i18n';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    private readonly i18n: I18nService,
  ) {}

  async findAll(query: QueryProductDto) {
    const products = await this.productRepository.findBy(query);
    return products.sort((prev, next) => (prev.sort > next.sort ? 1 : -1));
  }

  async findById(id: string): Promise<Product> {
    return Promise.resolve({
      id,
      name: 'omnibox pro',
      description: '小黑智能高级帐户',
      price: 10,
      currency: 'CNY',
      status: ProductStatus.ACTIVE,
      type: ProductType.ONE_TIME,
      sort: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    });

    // const product = await this.productRepository.findOne({
    //   where: { id },
    // });

    // if (!product) {
    //   throw new AppException(
    //     this.i18n.t('product.errors.productNotFound'),
    //     'PRODUCT_NOT_FOUND',
    //     HttpStatus.NOT_FOUND,
    //   );
    // }

    // return product;
  }
}
