import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import generateId from 'omniboxd/utils/generate-id';
import {
  Order,
  OrderStatus,
  PaymentMethod,
} from 'omniboxd/orders/entities/order.entity';
import { CreateOrderDto } from 'omniboxd/orders/dto/create-order.dto';
import { QueryOrderDto } from 'omniboxd/orders/dto/query-order.dto';
import { UpdateOrderDto } from 'omniboxd/orders/dto/update-order.dto';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
  ) {}

  private generateOrderNo(paymentMethod: PaymentMethod): string {
    const prefix = paymentMethod === PaymentMethod.ALIPAY ? 'ALIP' : 'WX';
    const timestamp = Date.now();
    const random = generateId(10);
    return `${prefix}${timestamp}${random}`;
  }

  async create(userId: string, dto: CreateOrderDto): Promise<Order> {
    const orderNo = this.generateOrderNo(dto.paymentMethod);

    const order = this.orderRepository.create({
      orderNo,
      userId,
      productId: dto.productId,
      amount: dto.amount,
      description: dto.description,
      paymentMethod: dto.paymentMethod,
      paymentType: dto.paymentType,
      metadata: dto.metadata || null,
      status: OrderStatus.PENDING,
    });

    return await this.orderRepository.save(order);
  }

  async findById(userId: string, orderId: string): Promise<Order> {
    const order = await this.orderRepository.findOne({
      where: { id: orderId, userId },
    });

    if (!order) {
      throw new NotFoundException('订单不存在');
    }

    return order;
  }

  async findByOrderNo(orderNo: string): Promise<Order> {
    const order = await this.orderRepository.findOne({
      where: { orderNo },
    });

    if (!order) {
      throw new NotFoundException('订单不存在');
    }

    return order;
  }

  async findByUser(userId: string, query: QueryOrderDto) {
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

  async update(orderId: string, dto: UpdateOrderDto): Promise<Order> {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException('订单不存在');
    }

    if (dto.status) {
      order.status = dto.status;

      // 根据状态更新时间
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

    if (dto.metadata) {
      order.metadata = { ...order.metadata, ...dto.metadata };
    }

    return await this.orderRepository.save(order);
  }

  async markAsPaid(orderNo: string, thirdPartyOrderNo: string): Promise<Order> {
    const order = await this.findByOrderNo(orderNo);

    if (order.status === OrderStatus.PAID) {
      return order;
    }

    if (order.status !== OrderStatus.PENDING) {
      throw new BadRequestException('订单状态不正确，无法标记为已支付');
    }

    order.status = OrderStatus.PAID;
    order.paidAt = new Date();
    order.thirdPartyOrderNo = thirdPartyOrderNo;

    return await this.orderRepository.save(order);
  }

  async close(orderNo: string): Promise<Order> {
    const order = await this.findByOrderNo(orderNo);

    if (order.status === OrderStatus.PAID) {
      throw new BadRequestException('已支付的订单无法关闭');
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
      throw new BadRequestException('只有已支付的订单才能退款');
    }

    order.status = OrderStatus.REFUNDED;
    order.refundedAt = new Date();

    return await this.orderRepository.save(order);
  }
}
