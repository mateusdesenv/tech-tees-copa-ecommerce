import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { User } from '@angular/fire/auth';
import { firstValueFrom } from 'rxjs';
import { environment } from '../environments/environment';

export type OrderStatus = 'pending' | 'paid' | 'cancelled' | 'failed' | 'completed';

export interface OrderPixData {
  qrCode?: string;
  qrCodeBase64?: string;
  ticketUrl?: string;
}

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
  paymentMethodId?: string;
  pix?: OrderPixData;
}

export interface CreateOrderInput {
  id?: string;
  userId: string;
  items: OrderItem[];
  total: number;
  status: OrderStatus;
  paymentId?: string;
  externalReference?: string;
  paymentMethodId?: string;
  pix?: OrderPixData;
}

@Injectable({ providedIn: 'root' })
export class OrderService {
  private readonly http = inject(HttpClient);
  private readonly ordersUrl = `${environment.apiBaseUrl}/orders`;
  private readonly storageKey = 'tech-tees-copa-orders-v1';

  async getOrdersByUser(user: User): Promise<Order[]> {
    const localOrders = this.getStoredOrdersByUser(user.uid);

    try {
      const idToken = await user.getIdToken();
      const apiOrders = await firstValueFrom(
        this.http.get<unknown[]>(`${this.ordersUrl}/mine`, {
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        }),
      );

      return this.mergeOrders(
        apiOrders.map((order) => this.normalizeApiOrder(order, user.uid)).filter((order): order is Order => Boolean(order)),
        localOrders,
      );
    } catch (error) {
      if (localOrders.length) {
        return localOrders;
      }

      throw error;
    }
  }

  private getStoredOrdersByUser(userId: string): Order[] {
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
      paymentMethodId: input.paymentMethodId,
      pix: input.pix ? { ...input.pix } : undefined,
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

  private normalizeApiOrder(value: unknown, userId: string): Order | null {
    if (!value || typeof value !== 'object') {
      return null;
    }

    const source = value as Record<string, unknown>;
    const id = String(source['id'] || source['externalReference'] || source['paymentId'] || '');
    const createdAt = String(source['createdAt'] || source['updatedAt'] || '');
    const total = Number(source['total'] ?? source['totalAmount'] ?? 0);
    const rawItems = Array.isArray(source['items']) ? source['items'] : [];

    if (!id || !createdAt || !Number.isFinite(total)) {
      return null;
    }

    return {
      id,
      userId,
      total,
      status: this.normalizeStatus(source['status'] || source['paymentStatus']),
      createdAt,
      paymentId: source['paymentId'] ? String(source['paymentId']) : undefined,
      externalReference: source['externalReference'] ? String(source['externalReference']) : undefined,
      paymentMethodId: source['paymentMethodId'] ? String(source['paymentMethodId']) : undefined,
      pix: this.normalizePix(source['pix']),
      items: rawItems.map((item) => this.normalizeApiItem(item)).filter((item): item is OrderItem => Boolean(item)),
    };
  }

  private normalizeApiItem(value: unknown): OrderItem | null {
    if (!value || typeof value !== 'object') {
      return null;
    }

    const source = value as Record<string, unknown>;
    const productId = String(source['productId'] || source['id'] || '');
    const name = String(source['name'] || source['title'] || 'Camiseta Tech Tees');
    const quantity = Math.max(1, Number(source['quantity'] || 1));
    const price = Number(source['price'] ?? source['unitPrice'] ?? source['unit_price'] ?? 0);

    if (!productId || !Number.isFinite(price)) {
      return null;
    }

    return {
      productId,
      name,
      quantity,
      price,
      size: source['size'] || source['selectedSize'] ? String(source['size'] || source['selectedSize']) : undefined,
      gender: source['gender'] || source['selectedGender'] ? String(source['gender'] || source['selectedGender']) : undefined,
      color: source['color'] || source['selectedColor'] ? String(source['color'] || source['selectedColor']) : undefined,
      image: source['image'] ? String(source['image']) : undefined,
    };
  }

  private normalizeStatus(value: unknown): OrderStatus {
    const status = String(value || '').toLowerCase();

    if (status === 'approved' || status === 'paid') return 'paid';
    if (status === 'completed') return 'completed';
    if (status === 'cancelled' || status === 'canceled') return 'cancelled';
    if (status === 'rejected' || status === 'failed') return 'failed';
    return 'pending';
  }

  private normalizePix(value: unknown): OrderPixData | undefined {
    if (!value || typeof value !== 'object') {
      return undefined;
    }

    const source = value as Record<string, unknown>;
    return {
      qrCode: source['qrCode'] ? String(source['qrCode']) : undefined,
      qrCodeBase64: source['qrCodeBase64'] ? String(source['qrCodeBase64']) : undefined,
      ticketUrl: source['ticketUrl'] ? String(source['ticketUrl']) : undefined,
    };
  }

  private mergeOrders(apiOrders: Order[], localOrders: Order[]): Order[] {
    const orders = new Map<string, Order>();

    [...localOrders, ...apiOrders].forEach((order) => {
      orders.set(order.externalReference || order.id, order);
    });

    return Array.from(orders.values()).sort((first, second) =>
      new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime(),
    );
  }
}
