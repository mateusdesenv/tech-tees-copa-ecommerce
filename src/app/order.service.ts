import { Injectable } from '@angular/core';

export type OrderStatus = 'pending' | 'paid' | 'cancelled' | 'failed' | 'completed';

export interface OrderItem {
  productId: string;
  name: string;
  quantity: number;
  price: number;
  size?: string;
  gender?: string;
  color?: string;
  image?: string;
}

export interface Order {
  id: string;
  userId: string;
  items: OrderItem[];
  total: number;
  status: OrderStatus;
  createdAt: string;
  paymentId?: string;
  externalReference?: string;
}

export interface CreateOrderInput {
  id?: string;
  userId: string;
  items: OrderItem[];
  total: number;
  status: OrderStatus;
  paymentId?: string;
  externalReference?: string;
}

@Injectable({ providedIn: 'root' })
export class OrderService {
  private readonly storageKey = 'tech-tees-copa-orders-v1';

  getOrdersByUser(userId: string): Order[] {
    return this.readOrders()
      .filter((order) => order.userId === userId)
      .sort((first, second) =>
        new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime(),
      );
  }

  createOrder(input: CreateOrderInput): Order {
    const orders = this.readOrders();
    const orderId = input.id || this.createId();
    const existingOrder = orders.find(
      (order) => order.id === orderId && order.userId === input.userId,
    );

    if (existingOrder) {
      return existingOrder;
    }

    const order: Order = {
      id: orderId,
      userId: input.userId,
      items: input.items.map((item) => ({ ...item })),
      total: Number(input.total.toFixed(2)),
      status: input.status,
      createdAt: new Date().toISOString(),
      paymentId: input.paymentId,
      externalReference: input.externalReference,
    };

    this.writeOrders([...orders, order]);
    return order;
  }

  private readOrders(): Order[] {
    const storedValue = window.localStorage.getItem(this.storageKey);

    if (!storedValue) {
      return [];
    }

    const parsedValue = JSON.parse(storedValue) as unknown;
    if (!Array.isArray(parsedValue)) {
      return [];
    }

    return parsedValue.filter((value): value is Order => this.isOrder(value));
  }

  private writeOrders(orders: Order[]): void {
    window.localStorage.setItem(this.storageKey, JSON.stringify(orders));
  }

  private createId(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }

    return `TT-${Date.now()}`;
  }

  private isOrder(value: unknown): value is Order {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const order = value as Partial<Order>;
    return Boolean(
      order.id &&
      order.userId &&
      Array.isArray(order.items) &&
      Number.isFinite(Number(order.total)) &&
      order.status &&
      order.createdAt,
    );
  }
}
