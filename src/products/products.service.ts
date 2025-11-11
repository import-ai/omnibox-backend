import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Product } from 'omniboxd/products/entities/product.entity';
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
    const product = await this.productRepository.findOne({
      where: { id },
    });

    if (!product) {
      throw new NotFoundException(
        this.i18n.t('product.errors.productNotFound'),
      );
    }

    return product;
  }
}
