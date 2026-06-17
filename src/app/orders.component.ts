import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from './auth.service';
import { Order, OrderService, OrderStatus } from './order.service';

@Component({
  selector: 'app-orders',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './orders.component.html',
})
export class OrdersComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly orderService = inject(OrderService);
  private readonly router = inject(Router);

  orders: Order[] = [];
  selectedOrder: Order | null = null;
  loading = true;
  errorMessage = '';

  async ngOnInit(): Promise<void> {
    try {
      const user = this.authService.currentUser || await this.authService.waitForAuthState();
      this.orders = user ? await this.orderService.getOrdersByUser(user) : [];
    } catch {
      this.errorMessage = 'Não foi possível carregar seus pedidos. Tente novamente.';
    } finally {
      this.loading = false;
    }
  }

  openDetails(order: Order): void {
    this.selectedOrder = order;
  }

  closeDetails(): void {
    this.selectedOrder = null;
  }

  backToStore(): void {
    void this.router.navigateByUrl('/', { replaceUrl: true });
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  }

  formatDate(value: string): string {
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(value));
  }

  itemQuantity(order: Order): number {
    return order.items.reduce((total, item) => total + item.quantity, 0);
  }

  statusLabel(status: OrderStatus): string {
    const labels: Record<OrderStatus, string> = {
      pending: 'Aguardando pagamento',
      paid: 'Pago',
      cancelled: 'Cancelado',
      failed: 'Falhou',
      completed: 'Concluído',
    };

    return labels[status];
  }
}
