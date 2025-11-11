import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import generateId from 'omniboxd/utils/generate-id';
import { ProductsService } from 'omniboxd/products/products.service';
import { CreateOrderDto } from 'omniboxd/orders/dto/create-order.dto';
import { QueryOrderDto } from 'omniboxd/orders/dto/query-order.dto';
import { UpdateOrderDto } from 'omniboxd/orders/dto/update-order.dto';
import {
  Order,
  OrderStatus,
  PaymentMethod,
} from 'omniboxd/orders/entities/order.entity';
import { Injectable, HttpStatus } from '@nestjs/common';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { I18nService } from 'nestjs-i18n';
import { ProductStatus } from 'omniboxd/products/entities/product.entity';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    private readonly productsService: ProductsService,
    private readonly i18n: I18nService,
  ) {}

  private generateOrderNo(paymentMethod: PaymentMethod): string {
    const prefix = paymentMethod === PaymentMethod.ALIPAY ? 'ALIP' : 'WX';
    const timestamp = Date.now();
    const random = generateId(10);
    return `${prefix}${timestamp}${random}`;
  }

  async create(userId: string, dto: CreateOrderDto): Promise<Order> {
    const product = await this.productsService.findById(dto.productId);

    if (product.status !== ProductStatus.ACTIVE) {
      throw new AppException(
        this.i18n.t('product.errors.productNotAvailable'),
        'PRODUCT_NOT_AVAILABLE',
        HttpStatus.BAD_REQUEST,
      );
    }

    const orderNo = this.generateOrderNo(dto.paymentMethod);

    const order = this.orderRepository.create({
      orderNo,
      userId,
      amount: product.price,
      currency: product.currency,
      productId: dto.productId,
      description: product.description,
      paymentMethod: dto.paymentMethod,
      paymentType: dto.paymentType,
      status: OrderStatus.PENDING,
    });

    return await this.orderRepository.save(order);
  }

  async findAll(userId: string, query: QueryOrderDto) {
    const { status, productId, page = 1, limit = 20 } = query;

    const queryBuilder = this.orderRepository
      .createQueryBuilder('order')
      .where('order.userId = :userId', { userId });

    if (status) {
      queryBuilder.andWhere('order.status = :status', { status });
    }

    if (productId) {
      queryBuilder.andWhere('order.productId = :productId', { productId });
    }

    const [items, total] = await queryBuilder
      .orderBy('order.createdAt', 'DESC')
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

  async findById(userId: string, orderId: string): Promise<Order> {
    const order = await this.orderRepository.findOne({
      where: { id: orderId, userId },
    });

    if (!order) {
      throw new AppException(
        this.i18n.t('order.errors.orderNotFound'),
        'ORDER_NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    }

    return order;
  }

  async findByOrderNo(orderNo: string): Promise<Order> {
    const order = await this.orderRepository.findOne({
      where: { orderNo },
    });

    if (!order) {
      throw new AppException(
        this.i18n.t('order.errors.orderNotFound'),
        'ORDER_NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    }

    return order;
  }

  async update(orderId: string, dto: UpdateOrderDto): Promise<Order> {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
    });

    if (!order) {
      throw new AppException(
        this.i18n.t('order.errors.orderNotFound'),
        'ORDER_NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    }

    if (dto.status) {
      order.status = dto.status;
      if (dto.status === OrderStatus.PAID && !order.paidAt) {
        order.paidAt = new Date();
      } else if (dto.status === OrderStatus.CLOSED && !order.closedAt) {
        order.closedAt = new Date();
      } else if (dto.status === OrderStatus.REFUNDED && !order.refundedAt) {
        order.refundedAt = new Date();
      }
    }

    if (dto.thirdPartyOrderNo) {
      order.thirdPartyOrderNo = dto.thirdPartyOrderNo;
    }

    return await this.orderRepository.save(order);
  }

  async markAsPaid(orderNo: string, thirdPartyOrderNo: string): Promise<Order> {
    const order = await this.findByOrderNo(orderNo);

    if (order.status === OrderStatus.PAID) {
      return order;
    }

    if (order.status !== OrderStatus.PENDING) {
      throw new AppException(
        this.i18n.t('order.errors.orderStatusIncorrect'),
        'ORDER_STATUS_INCORRECT',
        HttpStatus.BAD_REQUEST,
      );
    }

    order.status = OrderStatus.PAID;
    order.paidAt = new Date();
    order.thirdPartyOrderNo = thirdPartyOrderNo;

    return await this.orderRepository.save(order);
  }

  async close(orderNo: string): Promise<Order> {
    const order = await this.findByOrderNo(orderNo);

    if (order.status === OrderStatus.PAID) {
      throw new AppException(
        this.i18n.t('order.errors.paidOrderCannotClose'),
        'PAID_ORDER_CANNOT_CLOSE',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (order.status === OrderStatus.CLOSED) {
      return order;
    }

    order.status = OrderStatus.CLOSED;
    order.closedAt = new Date();

    return await this.orderRepository.save(order);
  }

  async refund(orderNo: string): Promise<Order> {
    const order = await this.findByOrderNo(orderNo);

    if (order.status !== OrderStatus.PAID) {
      throw new AppException(
        this.i18n.t('order.errors.onlyPaidOrderCanRefund'),
        'ONLY_PAID_ORDER_CAN_REFUND',
        HttpStatus.BAD_REQUEST,
      );
    }

    order.status = OrderStatus.REFUNDED;
    order.refundedAt = new Date();

    return await this.orderRepository.save(order);
  }
}
