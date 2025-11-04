import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Product,
  ProductStatus,
} from 'omniboxd/products/entities/product.entity';
import { CreateProductDto } from 'omniboxd/products/dto/create-product.dto';
import { UpdateProductDto } from 'omniboxd/products/dto/update-product.dto';
import { QueryProductDto } from 'omniboxd/products/dto/query-product.dto';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
  ) {}

  async create(dto: CreateProductDto): Promise<Product> {
    // 检查产品代码是否已存在
    const existingProduct = await this.productRepository.findOne({
      where: { code: dto.code },
    });

    if (existingProduct) {
      throw new ConflictException('产品代码已存在');
    }

    const product = this.productRepository.create({
      code: dto.code,
      name: dto.name,
      description: dto.description,
      price: dto.price,
      currency: dto.currency || 'CNY',
      status: dto.status || ProductStatus.ACTIVE,
      type: dto.type,
      stock: dto.stock !== undefined ? dto.stock : null,
      metadata: dto.metadata || null,
      sortOrder: dto.sortOrder || 0,
    });

    return await this.productRepository.save(product);
  }

  async findAll(query: QueryProductDto) {
    const { status, type, page = 1, limit = 20 } = query;

    const queryBuilder = this.productRepository.createQueryBuilder('product');

    if (status) {
      queryBuilder.andWhere('product.status = :status', { status });
    }

    if (type) {
      queryBuilder.andWhere('product.type = :type', { type });
    }

    const [items, total] = await queryBuilder
      .orderBy('product.sortOrder', 'ASC')
      .addOrderBy('product.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findById(id: string): Promise<Product> {
    const product = await this.productRepository.findOne({
      where: { id },
    });

    if (!product) {
      throw new NotFoundException('产品不存在');
    }

    return product;
  }

  async findByCode(code: string): Promise<Product> {
    const product = await this.productRepository.findOne({
      where: { code },
    });

    if (!product) {
      throw new NotFoundException('产品不存在');
    }

    return product;
  }

  async update(id: string, dto: UpdateProductDto): Promise<Product> {
    const product = await this.findById(id);

    if (dto.name !== undefined) {
      product.name = dto.name;
    }

    if (dto.description !== undefined) {
      product.description = dto.description;
    }

    if (dto.price !== undefined) {
      product.price = dto.price;
    }

    if (dto.currency !== undefined) {
      product.currency = dto.currency;
    }

    if (dto.status !== undefined) {
      product.status = dto.status;
    }

    if (dto.type !== undefined) {
      product.type = dto.type;
    }

    if (dto.stock !== undefined) {
      product.stock = dto.stock;
    }

    if (dto.metadata !== undefined) {
      product.metadata = { ...product.metadata, ...dto.metadata };
    }

    if (dto.sortOrder !== undefined) {
      product.sortOrder = dto.sortOrder;
    }

    return await this.productRepository.save(product);
  }

  async delete(id: string): Promise<void> {
    const product = await this.findById(id);
    await this.productRepository.remove(product);
  }

  async decreaseStock(productId: string, quantity: number): Promise<Product> {
    const product = await this.findById(productId);

    if (product.stock === null) {
      // 无限库存，不需要减少
      return product;
    }

    if (product.stock < quantity) {
      throw new BadRequestException('库存不足');
    }

    product.stock -= quantity;
    return await this.productRepository.save(product);
  }

  async increaseStock(productId: string, quantity: number): Promise<Product> {
    const product = await this.findById(productId);

    if (product.stock === null) {
      // 无限库存，不需要增加
      return product;
    }

    product.stock += quantity;
    return await this.productRepository.save(product);
  }
}
