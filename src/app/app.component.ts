import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { AfterViewInit, Component, ElementRef, OnDestroy, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

interface StoreResponse {
  id: string;
  name?: string;
  slug?: string;
}

interface Product {
  id?: string;
  name: string;
  price: number | string;
  image?: string;
  category?: string;
  sales?: number;
  status?: string;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent implements AfterViewInit, OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly elementRef: ElementRef<HTMLElement> = inject(ElementRef);

  readonly apiBaseUrl = 'https://tech-tees-admin-api.vercel.app';
  readonly storeName = 'Copa do mundo';
  readonly storeSlug = 'copa-do-mundo';
  readonly fallbackImage = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 800 1000%22%3E%3Crect width=%22800%22 height=%221000%22 fill=%22%23eee8dc%22/%3E%3Ctext x=%22400%22 y=%22500%22 text-anchor=%22middle%22 font-family=%22Arial%22 font-size=%2232%22 font-weight=%22700%22 fill=%22%236d675d%22%3ETECH-TEES%3C/text%3E%3C/svg%3E';

  loading = true;
  catalogMessage = '';
  catalogTone: 'error' | '' = '';
  products: Product[] = [];
  activeProducts: Product[] = [];
  featuredProduct: Product | null = null;
  editorialProducts: Array<Product | null> = [null, null];
  lookbookProducts: Array<Product | null> = [null, null, null, null];
  skeletonItems = Array.from({ length: 8 });

  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private scrollHandler?: () => void;
  private resizeHandler?: () => void;

  ngAfterViewInit(): void {
    this.initScrollAnimations();
    this.initParallax();
    void this.loadProducts();
  }

  ngOnDestroy(): void {
    if (this.scrollHandler) {
      window.removeEventListener('scroll', this.scrollHandler);
    }

    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler);
    }
  }

  formatCurrency(value: number | string): string {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(Number(value) || 0);
  }

  normalizeImagePath(image?: string): string {
    const value = String(image || '').trim();

    if (!value) {
      return this.fallbackImage;
    }

    if (/^(https?:|data:|assets\/)/.test(value)) {
      return value;
    }

    return `assets/${value}`;
  }

  setFallbackImage(event: Event): void {
    const image = event.target as HTMLImageElement;
    image.onerror = null;
    image.src = this.fallbackImage;
  }

  private async loadProducts(): Promise<void> {
    this.loading = true;
    this.catalogMessage = '';
    this.catalogTone = '';

    try {
      const store = await this.findCopaStore();

      if (!store) {
        this.showMessage(`A loja "${this.storeName}" não foi encontrada na API.`, 'error');
        return;
      }

      const products = await firstValueFrom(
        this.http.get<Product[]>(`${this.apiBaseUrl}/products?storeId=${encodeURIComponent(store.id)}`),
      );

      this.products = products;
      this.activeProducts = products.filter((product) => product.status === 'active');

      if (this.activeProducts.length === 0) {
        this.showMessage('Nenhuma camiseta ativa encontrada.');
        return;
      }

      this.renderDynamicSections(this.activeProducts);
      this.loading = false;
      setTimeout(() => this.refreshParallax());
    } catch {
      this.showMessage('Não foi possível carregar as camisetas da API.', 'error');
    }
  }

  private async findCopaStore(): Promise<StoreResponse | null> {
    try {
      return await firstValueFrom(
        this.http.get<StoreResponse>(`${this.apiBaseUrl}/stores/public?slug=${encodeURIComponent(this.storeSlug)}`),
      );
    } catch (error: any) {
      if (error?.status === 404) {
        return null;
      }

      throw error;
    }
  }

  private showMessage(message: string, tone: 'error' | '' = ''): void {
    this.loading = false;
    this.activeProducts = [];
    this.catalogMessage = message;
    this.catalogTone = tone;
  }

  private renderDynamicSections(products: Product[]): void {
    const productsWithImages = products.filter((product) => product.image);
    const sourceProducts = productsWithImages.length > 0 ? productsWithImages : products;

    this.featuredProduct = this.pickProduct(sourceProducts, 4);
    this.editorialProducts = [this.pickProduct(sourceProducts, 6), this.pickProduct(sourceProducts, 7)];
    this.lookbookProducts = [8, 9, 10, 11].map((index) => this.pickProduct(sourceProducts, index));
  }

  private pickProduct(products: Product[], index: number): Product | null {
    if (products.length === 0) {
      return null;
    }

    return products[index % products.length];
  }

  private initScrollAnimations(): void {
    const elements = Array.from(this.elementRef.nativeElement.querySelectorAll('.reveal')) as HTMLElement[];

    if (this.reducedMotion || !('IntersectionObserver' in window)) {
      elements.forEach((element) => element.classList.add('is-visible'));
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }

        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.18 });

    elements.forEach((element) => observer.observe(element));
  }

  private initParallax(): void {
    if (this.reducedMotion) {
      return;
    }

    let ticking = false;

    const requestParallaxUpdate = () => {
      if (ticking) {
        return;
      }

      ticking = true;
      window.requestAnimationFrame(() => {
        this.refreshParallax();
        ticking = false;
      });
    };

    this.scrollHandler = requestParallaxUpdate;
    this.resizeHandler = requestParallaxUpdate;

    this.refreshParallax();
    window.addEventListener('scroll', requestParallaxUpdate, { passive: true });
    window.addEventListener('resize', requestParallaxUpdate);
  }

  private refreshParallax(): void {
    const root = this.elementRef.nativeElement;
    const hero = root.querySelector('[data-parallax="hero"]') as HTMLElement | null;
    const heroLayer = root.querySelector('[data-parallax-layer="hero"]') as HTMLElement | null;
    const sections = Array.from(root.querySelectorAll('[data-parallax="section"]')) as HTMLElement[];
    const layers = Array.from(root.querySelectorAll('[data-parallax-layer="product"]')) as HTMLElement[];
    const slowLayers = Array.from(root.querySelectorAll('[data-parallax-layer="slow"]')) as HTMLElement[];
    const viewportHeight = window.innerHeight || 1;

    if (hero && heroLayer) {
      const rect = hero.getBoundingClientRect();
      const progress = this.clamp(-rect.top / Math.max(rect.height, 1), 0, 1);
      heroLayer.style.setProperty('--parallax-y', `${progress * 84}px`);
      heroLayer.style.setProperty('--parallax-scale', `${1.04 + progress * 0.045}`);
    }

    sections.forEach((section) => {
      const rect = section.getBoundingClientRect();
      const centerOffset = (rect.top + rect.height / 2 - viewportHeight / 2) / viewportHeight;
      const wash = this.clamp(centerOffset * -38, -32, 32);
      section.style.setProperty('--section-wash', `${wash}%`);
    });

    layers.forEach((layer, index) => {
      const rect = layer.getBoundingClientRect();
      const centerOffset = (rect.top + rect.height / 2 - viewportHeight / 2) / viewportHeight;
      const direction = index % 2 === 0 ? -1 : 1;
      const offset = this.clamp(centerOffset * 34 * direction, -28, 28);
      layer.style.setProperty('--parallax-y', `${offset}px`);
    });

    slowLayers.forEach((layer) => {
      const rect = layer.getBoundingClientRect();
      const centerOffset = (rect.top + rect.height / 2 - viewportHeight / 2) / viewportHeight;
      const offset = this.clamp(centerOffset * -24, -18, 18);
      layer.style.setProperty('--parallax-y', `${offset}px`);
    });
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }
}
