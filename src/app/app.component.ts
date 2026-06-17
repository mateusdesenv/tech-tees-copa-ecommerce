import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { AfterViewInit, Component, ElementRef, HostListener, OnDestroy, OnInit, inject } from '@angular/core';
import { User } from '@angular/fire/auth';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { Subscription, filter, finalize, firstValueFrom, forkJoin } from 'rxjs';
import { environment } from '../environments/environment';
import { AuthService } from './auth.service';
import { CatalogCategory, CategoryService } from './category.service';
import { CONTACT_INFO } from './contact-info';
import { MetaPixelService } from './meta-pixel.service';
import { OrderItem, OrderService } from './order.service';
import { ProductService } from './product.service';

declare global {
  interface Window {
    MercadoPago?: new (publicKey: string, options?: { locale?: string }) => MercadoPagoInstance;
  }
}

interface MercadoPagoInstance {
  bricks(): {
    create(
      type: 'cardPayment',
      containerId: string,
      settings: MercadoPagoCardPaymentSettings,
    ): Promise<MercadoPagoBrickController>;
  };
}

interface MercadoPagoBrickController {
  unmount?: () => void;
}

interface MercadoPagoCardPaymentSettings {
  initialization: {
    amount: number;
    payer?: { email?: string };
  };
  customization?: Record<string, unknown>;
  callbacks: {
    onReady: () => void;
    onSubmit: (formData: Record<string, unknown>) => Promise<void>;
    onError: (error: unknown) => void;
  };
}

interface StoreResponse {
  id: string;
  name?: string;
  slug?: string;
  defaultShipping?: number;
}

interface Product {
  id?: string;
  slug?: string;
  sku?: string;
  name: string;
  price: number | string;
  image?: string;
  imageBack?: string;
  imageFemale?: string;
  imageBackFemale?: string;
  color?: string;
  colorId?: string;
  colorHex?: string;
  colorRgb?: ColorRgb | null;
  colors?: ProductColorVariation[];
  category?: string;
  categoryId?: string;
  categoryIds?: string[];
  categories?: Array<string | {
    id?: string;
    slug?: string;
    name?: string;
    title?: string;
    label?: string;
    value?: string;
  }>;
  description?: string;
  sales?: number;
  status?: string;
  sizes?: ProductSize[];
  genders?: ProductGender[];
  selectedSize?: ProductSize;
  selectedGender?: ProductGender;
}

type ProductSize = 'P' | 'M' | 'G';
type ProductGender = 'Masculino' | 'Feminino';
type HomeCategoryKey = 'jogadores' | 'artistas' | 'fashion';

interface HomeCategory {
  key: HomeCategoryKey;
  label: string;
  description: string;
}

interface ColorRgb {
  r: number;
  g: number;
  b: number;
}

interface ProductColorVariation {
  id?: string;
  color: string;
  colorId?: string;
  colorHex?: string;
  colorRgb?: ColorRgb | null;
  image?: string;
  imageBack?: string;
  imageFemale?: string;
  imageBackFemale?: string;
}

interface CartItem {
  product: Product;
  quantity: number;
}

type CheckoutStep = 'address' | 'payment' | 'confirmation';

interface AddressForm {
  fullName: string;
  email: string;
  cpf: string;
  cep: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
}

interface MercadoPagoPaymentResponse {
  id: number;
  paymentId?: string | number;
  status: string;
  statusDetail?: string;
  paymentMethodId?: string;
  externalReference: string;
  pix?: PixPaymentData;
}

interface PixPaymentData {
  qrCode?: string;
  qrCodeBase64?: string;
  ticketUrl?: string;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly elementRef: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly metaPixel = inject(MetaPixelService);
  private readonly authService = inject(AuthService);
  private readonly categoryService = inject(CategoryService);
  private readonly productService = inject(ProductService);
  private readonly orderService = inject(OrderService);
  private readonly router = inject(Router);
  private readonly cartStorageKey = 'tech-tees-copa-cart-v1';
  private readonly minimumHomeSkeletonMs = 320;
  private readonly maxHomeProductsPerCategory = 4;

  readonly apiBaseUrl = environment.apiBaseUrl;
  readonly mercadoPagoPublicKey = environment.mercadoPagoPublicKey;
  readonly storeName = environment.storeName;
  readonly storeSlug = environment.storeSlug;
  readonly contactInfo = CONTACT_INFO;
  readonly fallbackImage = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 800 1000%22%3E%3Crect width=%22800%22 height=%221000%22 fill=%22%23eee8dc%22/%3E%3Ctext x=%22400%22 y=%22500%22 text-anchor=%22middle%22 font-family=%22Arial%22 font-size=%2232%22 font-weight=%22700%22 fill=%22%236d675d%22%3ETECH-TEES%3C/text%3E%3C/svg%3E';
  readonly homeCategories: HomeCategory[] = [
    { key: 'jogadores', label: 'Jogadores', description: 'Camisetas inspiradas nos craques que marcaram gerações dentro e fora de campo.' },
    { key: 'artistas', label: 'Artistas', description: 'Estampas com referências da música, cultura e personalidade brasileira.' },
    { key: 'fashion', label: 'Fashion', description: 'Peças com estética streetwear, corte premium e leitura editorial.' },
  ];

  loading = true;
  catalogMessage = '';
  catalogTone: 'error' | '' = '';
  products: Product[] = [];
  activeProducts: Product[] = [];
  catalogProducts: Product[] = [];
  filteredCatalogProducts: Product[] = [];
  catalogCategories: CatalogCategory[] = [];
  catalogSearch = '';
  selectedCatalogCategory = '';
  catalogSort: 'price-asc' | 'price-desc' = 'price-asc';
  catalogView: 'grid' | 'list' = 'grid';
  catalogCategoryError = '';
  visibleCategoryKeys: HomeCategoryKey[] = [];
  loadingCategoryKey: HomeCategoryKey | null = null;
  homeCategoryProducts: Record<HomeCategoryKey, Product[]> = this.emptyHomeCategoryProducts();
  homeCategoryErrors: Record<HomeCategoryKey, string> = this.emptyHomeCategoryErrors();
  homeCategoryCatalogMap: Record<HomeCategoryKey, CatalogCategory | null> = this.emptyHomeCategoryCatalogMap();
  isLoadingHome = false;
  activeStore: StoreResponse | null = null;
  selectedProduct: Product | null = null;
  selectedProductColorIndex = 0;
  selectedProductImageSide: 'front' | 'back' = 'front';
  featuredProduct: Product | null = null;
  editorialProducts: Array<Product | null> = [null, null];
  lookbookProducts: Array<Product | null> = [null, null, null, null];
  skeletonItems = Array.from({ length: 8 });
  homeSkeletonItems = Array.from({ length: 4 });
  readonly user$ = this.authService.user$;
  cartItems: CartItem[] = this.readStoredCart();
  lastAddedProductName = '';
  cartOpen = false;
  accountMenuOpen = false;
  isCheckoutView = false;
  isCatalogView = false;
  isAuthRoute = false;
  checkoutStep: CheckoutStep = 'address';
  addressSubmitted = false;
  cepLoading = false;
  cepError = '';
  checkoutError = '';
  paymentStatus = '';
  selectedPaymentMethod: 'card' | 'pix' = 'card';
  pixPayment: MercadoPagoPaymentResponse | null = null;
  pixCopyStatus = '';
  isCheckingOut = false;
  hoverCarouselTick = 0;
  cardColorSelection: Record<string, number> = {};
  selectedProductSize: ProductSize = 'M';
  selectedProductGender: ProductGender = 'Masculino';
  readonly productSizes: ProductSize[] = ['P', 'M', 'G'];
  readonly productGenders: ProductGender[] = ['Masculino', 'Feminino'];
  readonly addressForm: AddressForm = {
    fullName: '',
    email: '',
    cpf: '',
    cep: '',
    street: '',
    number: '',
    complement: '',
    neighborhood: '',
    city: '',
    state: '',
  };

  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private scrollHandler?: () => void;
  private resizeHandler?: () => void;
  private hoverCarouselProductKey = '';
  private hoverCarouselIntervalId?: number;
  private cardPaymentBrickController: MercadoPagoBrickController | null = null;
  private readonly productCardImagesCache = new Map<string, string[]>();
  private routerSubscription?: Subscription;
  private viewInitialized = false;
  private homeLoaded = false;
  private catalogLoaded = false;
  private homeLoadPromise?: Promise<void>;
  private catalogLoadPromise?: Promise<void>;
  private currentRoutePath = '';
  private reloadHomeOnNextEnsure = false;

  ngOnInit(): void {
    this.metaPixel.init();
    this.user$.subscribe((user) => {
      if (!user) {
        return;
      }

      if (!this.addressForm.email) {
        this.addressForm.email = user.email || '';
      }

      if (!this.addressForm.fullName) {
        this.addressForm.fullName = user.displayName || '';
      }
    });
    this.syncViewWithRoute(this.router.url);

    this.routerSubscription = this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => {
        this.syncViewWithRoute(event.urlAfterRedirects);
        this.metaPixel.trackPageView();
        if (this.viewInitialized) {
          void this.ensureRouteData();
        }
      });
  }

  ngAfterViewInit(): void {
    this.initScrollAnimations();
    this.initParallax();
    this.viewInitialized = true;
    void this.ensureRouteData();
  }

  ngOnDestroy(): void {
    if (this.scrollHandler) {
      window.removeEventListener('scroll', this.scrollHandler);
    }

    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler);
    }

    if (this.hoverCarouselIntervalId) {
      window.clearInterval(this.hoverCarouselIntervalId);
    }

    this.routerSubscription?.unsubscribe();
  }

  @HostListener('document:click')
  closeAccountMenu(): void {
    this.accountMenuOpen = false;
  }

  formatCurrency(value: number | string): string {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(Number(value) || 0);
  }

  openCatalog(categoryId = ''): void {
    void this.router.navigate(['/catalogo'], {
      queryParams: categoryId ? { categoryId } : undefined,
    });
  }

  updateCatalogFilters(): void {
    const search = this.catalogSearch.trim().toLocaleLowerCase('pt-BR');
    const selectedCategory = this.catalogCategories.find(
      (category) => category.id === this.selectedCatalogCategory,
    );

    this.filteredCatalogProducts = this.catalogProducts
      .filter((product) => !search || product.name.toLocaleLowerCase('pt-BR').includes(search))
      .filter((product) => !selectedCategory || this.productMatchesCategory(product, selectedCategory))
      .sort((first, second) => {
        const priceDifference = Number(first.price || 0) - Number(second.price || 0);
        return this.catalogSort === 'price-desc' ? -priceDifference : priceDifference;
      });
  }

  clearCatalogFilters(): void {
    this.catalogSearch = '';
    this.selectedCatalogCategory = '';
    this.catalogSort = 'price-asc';
    this.updateCatalogFilters();
  }

  setCatalogView(view: 'grid' | 'list'): void {
    this.catalogView = view;
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
    image.classList.add('is-loaded', 'is-fallback');
  }

  markImageLoaded(event: Event): void {
    (event.target as HTMLImageElement).classList.add('is-loaded');
  }

  productCardCarouselImages(product: Product): string[] {
    const cacheKey = `${this.getBaseProductKey(product)}::${this.selectedCardColorIndex(product)}`;
    const cachedImages = this.productCardImagesCache.get(cacheKey);

    if (cachedImages) {
      return cachedImages;
    }

    const selectedVariation = this.selectedCardColor(product);
    const variationImages = this.productColors(product)
      .map((variation) => variation.image)
      .filter((image): image is string => Boolean(String(image || '').trim()));
    const orderedImages = selectedVariation?.image
      ? [selectedVariation.image, ...variationImages.filter((image) => image !== selectedVariation.image)]
      : variationImages;
    const images = orderedImages.length > 0 ? orderedImages : [product.image || this.fallbackImage];

    const uniqueImages = Array.from(new Set(images));
    this.productCardImagesCache.set(cacheKey, uniqueImages);
    return uniqueImages;
  }

  productCardCarouselImage(product: Product, cardIndex: number): string {
    const images = this.productCardCarouselImages(product);
    return images[this.productCardCarouselIndex(product, cardIndex)] || this.fallbackImage;
  }

  productCardCarouselIndex(product: Product, cardIndex: number): number {
    const images = this.productCardCarouselImages(product);
    const productKey = this.getBaseProductKey(product);

    if (images.length <= 1 || this.hoverCarouselProductKey !== productKey) {
      return 0;
    }

    return (this.hoverCarouselTick + cardIndex) % images.length;
  }

  startProductCardCarousel(product: Product): void {
    if (this.reducedMotion || this.productCardCarouselImages(product).length <= 1) {
      return;
    }

    this.stopProductCardCarousel();
    this.hoverCarouselProductKey = this.getBaseProductKey(product);
    this.hoverCarouselTick = 1;
    this.hoverCarouselIntervalId = window.setInterval(() => {
      this.hoverCarouselTick += 1;
    }, 1500);
  }

  stopProductCardCarousel(): void {
    if (this.hoverCarouselIntervalId) {
      window.clearInterval(this.hoverCarouselIntervalId);
      this.hoverCarouselIntervalId = undefined;
    }

    this.hoverCarouselProductKey = '';
    this.hoverCarouselTick = 0;
  }

  addToCart(product: Product): void {
    const productKey = this.getProductKey(product);
    const existingItem = this.cartItems.find((item) => this.getProductKey(item.product) === productKey);

    if (existingItem) {
      existingItem.quantity += 1;
    } else {
      this.cartItems = [...this.cartItems, { product, quantity: 1 }];
    }

    this.persistCart();
    this.lastAddedProductName = product.name;
    this.metaPixel.trackEvent('AddToCart', this.productPixelParams(product));
  }

  addCardProductToCart(product: Product): void {
    this.addToCart(this.productWithCardDefaults(product));
  }

  productColors(product: Product): ProductColorVariation[] {
    const variations = Array.isArray(product.colors)
      ? product.colors.filter((variation) =>
          variation.color
          || variation.colorId
          || variation.image
          || variation.imageBack
          || variation.imageFemale
          || variation.imageBackFemale)
      : [];

    if (variations.length > 0) {
      return variations;
    }

    if (product.color || product.colorId || product.colorHex) {
      return [{
        id: product.id || product.name,
        color: product.color || 'Cor principal',
        colorId: product.colorId,
        colorHex: product.colorHex,
        colorRgb: product.colorRgb,
        image: product.image,
        imageBack: product.imageBack,
        imageFemale: product.imageFemale,
        imageBackFemale: product.imageBackFemale,
      }];
    }

    return [];
  }

  visibleProductColors(product: Product): ProductColorVariation[] {
    return this.productColors(product).slice(0, 6);
  }

  hiddenProductColorsCount(product: Product): number {
    return Math.max(0, this.productColors(product).length - 6);
  }

  selectedCardColorIndex(product: Product): number {
    const productKey = this.getBaseProductKey(product);
    const selectedIndex = this.cardColorSelection[productKey] ?? 0;
    return this.productColors(product)[selectedIndex] ? selectedIndex : 0;
  }

  selectedCardColor(product: Product): ProductColorVariation | null {
    const colors = this.productColors(product);
    return colors[this.selectedCardColorIndex(product)] || colors[0] || null;
  }

  selectCardColor(event: Event, product: Product, index: number): void {
    event.stopPropagation();
    const variation = this.productColors(product)[index];

    if (!variation) {
      return;
    }

    this.cardColorSelection = {
      ...this.cardColorSelection,
      [this.getBaseProductKey(product)]: index,
    };
    this.clearProductCardImageCache(product);
    this.hoverCarouselTick = 0;
  }

  trackByProductId(index: number, product: Product): string {
    return String(
      product?.id
      ?? product?.slug
      ?? product?.sku
      ?? product?.name
      ?? `product-${index}`,
    );
  }

  trackByImage(index: number, image: string): string {
    return image || String(index);
  }

  trackByProductColor(index: number, variation: ProductColorVariation): string {
    return variation.id || variation.colorId || variation.color || String(index);
  }

  trackByHomeCategoryKey(_index: number, category: HomeCategory): string {
    return category.key;
  }

  trackByIndex(index: number): number {
    return index;
  }

  isHomeCategoryVisible(key: HomeCategoryKey): boolean {
    return this.visibleCategoryKeys.includes(key);
  }

  isHomeCategoryLoading(key: HomeCategoryKey): boolean {
    return this.isLoadingHome && this.loadingCategoryKey === key;
  }

  homeProductsByCategory(key: HomeCategoryKey): Product[] {
    return this.homeCategoryProducts[key] || [];
  }

  homeCategoryError(key: HomeCategoryKey): string {
    return this.homeCategoryErrors[key] || '';
  }

  homeCategoryCatalog(key: HomeCategoryKey): CatalogCategory | null {
    return this.homeCategoryCatalogMap[key] || null;
  }

  homeCategoryCardDelay(key: HomeCategoryKey, index: number): number {
    const categoryIndex = this.homeCategories.findIndex((category) => category.key === key);
    return Math.max(0, categoryIndex * this.homeSkeletonItems.length + index) * 70;
  }

  productColorBackground(variation: ProductColorVariation): string {
    if (/^#[0-9a-f]{6}$/i.test(String(variation.colorHex || ''))) {
      return String(variation.colorHex);
    }

    const rgb = variation.colorRgb;
    return rgb ? `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})` : 'transparent';
  }

  productColorHasVisual(variation: ProductColorVariation): boolean {
    return Boolean(
      /^#[0-9a-f]{6}$/i.test(String(variation.colorHex || ''))
      || variation.colorRgb,
    );
  }

  private productWithCardDefaults(product: Product): Product {
    const variation = this.selectedCardColor(product);

    return {
      ...product,
      color: variation?.color || product.color,
      colorId: variation?.colorId || product.colorId,
      colorHex: variation?.colorHex || product.colorHex,
      colorRgb: variation?.colorRgb || product.colorRgb,
      image: variation?.image || product.image,
      imageBack: variation?.imageBack || product.imageBack,
      imageFemale: variation?.imageFemale || product.imageFemale,
      imageBackFemale: variation?.imageBackFemale || product.imageBackFemale,
      selectedSize: 'M',
      selectedGender: 'Masculino',
    };
  }

  addSelectedProductToCart(): void {
    const product = this.selectedProductWithSelectedColor();

    if (product) {
      this.addToCart(product);
    }
  }

  openProduct(product: Product): void {
    this.selectedProduct = product;
    this.selectedProductColorIndex = this.selectedCardColorIndex(product);
    this.selectedProductSize = 'M';
    this.selectedProductGender = 'Masculino';
    this.selectedProductImageSide = 'front';
    this.cartOpen = false;
    this.isCheckoutView = false;
    this.resetPaymentBrick();
    this.metaPixel.trackPageView();
    this.metaPixel.trackEvent('ViewContent', this.productPixelParams(this.selectedProductWithSelectedColor() || product));
    window.scrollTo({ top: 0, behavior: this.reducedMotion ? 'auto' : 'smooth' });
  }

  closeProduct(): void {
    this.selectedProduct = null;
    this.selectedProductColorIndex = 0;
    this.selectedProductImageSide = 'front';
    this.metaPixel.trackPageView();
    window.scrollTo({ top: 0, behavior: this.reducedMotion ? 'auto' : 'smooth' });
  }

  selectProductImageSide(side: 'front' | 'back'): void {
    if (side === 'back' && !this.selectedProductBackImageAvailable()) {
      return;
    }

    this.selectedProductImageSide = side;
  }

  selectProductColor(index: number): void {
    const colors = this.selectedProductColors();

    if (!colors[index]) {
      return;
    }

    this.selectedProductColorIndex = index;

    if (this.selectedProductImageSide === 'back' && !this.variationImage(colors[index], 'back')) {
      this.selectedProductImageSide = 'front';
    }
  }

  selectedProductColors(): ProductColorVariation[] {
    if (!this.selectedProduct) {
      return [];
    }

    const validColors = this.productColors(this.selectedProduct);

    if (validColors.length > 0) {
      return validColors;
    }

    return [{
      id: this.selectedProduct.id || this.selectedProduct.name,
      color: this.selectedProduct.color || 'Cor principal',
      colorId: this.selectedProduct.colorId,
      colorHex: this.selectedProduct.colorHex,
      colorRgb: this.selectedProduct.colorRgb,
      image: this.selectedProduct.image,
      imageBack: this.selectedProduct.imageBack,
      imageFemale: this.selectedProduct.imageFemale,
      imageBackFemale: this.selectedProduct.imageBackFemale,
    }];
  }

  selectedProductColor(): ProductColorVariation | null {
    return this.selectedProductColors()[this.selectedProductColorIndex] || this.selectedProductColors()[0] || null;
  }

  selectedProductImage(): string {
    if (!this.selectedProduct) {
      return this.fallbackImage;
    }

    const selectedColor = this.selectedProductColor();

    return this.variationImage(selectedColor, this.selectedProductImageSide)
      || this.variationImage(this.selectedProduct, this.selectedProductImageSide)
      || this.fallbackImage;
  }

  selectedProductBackImageAvailable(): boolean {
    return Boolean(
      this.variationImage(this.selectedProductColor(), 'back')
      || this.variationImage(this.selectedProduct, 'back'),
    );
  }

  selectedProductImageAlt(): string {
    if (!this.selectedProduct) {
      return 'Produto Tech-Tees';
    }

    const side = this.selectedProductImageSide === 'back' ? 'verso' : 'frente';
    const color = this.selectedProductColor()?.color;
    return `${this.selectedProduct.name}${color ? ` ${color}` : ''} - ${side}`;
  }

  selectedProductWithSelectedColor(): Product | null {
    if (!this.selectedProduct) {
      return null;
    }

    const variation = this.selectedProductColor();

    if (!variation) {
      return {
        ...this.selectedProduct,
        selectedSize: this.selectedProductSize,
        selectedGender: this.selectedProductGender,
      };
    }

    return {
      ...this.selectedProduct,
      color: variation.color || this.selectedProduct.color,
      colorId: variation.colorId || this.selectedProduct.colorId,
      colorHex: variation.colorHex || this.selectedProduct.colorHex,
      colorRgb: variation.colorRgb || this.selectedProduct.colorRgb,
      image: this.variationImage(variation, 'front') || this.variationImage(this.selectedProduct, 'front'),
      imageBack: this.variationImage(variation, 'back') || this.variationImage(this.selectedProduct, 'back'),
      imageFemale: variation.imageFemale || this.selectedProduct.imageFemale,
      imageBackFemale: variation.imageBackFemale || this.selectedProduct.imageBackFemale,
      selectedSize: this.selectedProductSize,
      selectedGender: this.selectedProductGender,
    };
  }

  async goToCheckout(): Promise<void> {
    if (!this.cartItems.length) {
      return;
    }

    if (!this.cartItems.every((item) => item.product.selectedSize && item.product.selectedGender)) {
      this.checkoutError = 'Selecione tamanho e gênero para todos os itens.';
      return;
    }

    const user = await this.authService.waitForAuthState();

    if (!user) {
      this.cartOpen = false;
      await this.router.navigate(['/login'], {
        queryParams: {
          returnUrl: '/checkout',
          reason: 'checkout',
        },
      });
      return;
    }

    await this.router.navigate(['/checkout']);
  }

  backToStore(): void {
    void this.router.navigate(['/']);
  }

  openLogin(): void {
    void this.router.navigate(['/login']);
  }

  toggleAccountMenu(event: Event): void {
    event.stopPropagation();
    this.accountMenuOpen = !this.accountMenuOpen;
  }

  navigateToCustomerPage(path: '/minha-conta' | '/minhas-compras'): void {
    this.accountMenuOpen = false;
    void this.router.navigate([path]);
  }

  async logout(): Promise<void> {
    this.accountMenuOpen = false;
    await this.authService.logout();
    await this.router.navigate(['/']);
  }

  userInitials(user: User): string {
    const source = user.displayName || user.email || 'Tech Tees';
    return source
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase();
  }

  openCart(): void {
    this.cartOpen = true;
  }

  closeCart(): void {
    this.cartOpen = false;
  }

  increaseCartItem(item: CartItem): void {
    item.quantity += 1;
    this.persistCart();
  }

  decreaseCartItem(item: CartItem): void {
    if (item.quantity <= 1) {
      this.removeCartItem(item);
      return;
    }

    item.quantity -= 1;
    this.persistCart();
  }

  removeCartItem(item: CartItem): void {
    const productKey = this.getProductKey(item.product);
    this.cartItems = this.cartItems.filter((cartItem) => this.getProductKey(cartItem.product) !== productKey);
    this.persistCart();

    if (this.cartItems.length === 0) {
      this.closeCart();
      this.resetPaymentBrick();
      void this.router.navigate(['/']);
    }
  }

  cartQuantity(): number {
    return this.cartItems.reduce((total, item) => total + item.quantity, 0);
  }

  cartTotal(): number {
    return this.cartItems.reduce((total, item) => total + Number(item.product.price || 0) * item.quantity, 0);
  }

  shipping(): number {
    if (!this.cartItems.length || this.cartTotal() >= 199) {
      return 0;
    }

    return Number(this.activeStore?.defaultShipping ?? 19.9);
  }

  orderTotal(): number {
    return this.cartTotal() + this.shipping();
  }

  productCartQuantity(product: Product): number {
    const productKey = this.getProductKey(this.productWithCardDefaults(product));
    return this.cartItems.find((item) => this.getProductKey(item.product) === productKey)?.quantity || 0;
  }

  itemTotal(item: CartItem): number {
    return Number(item.product.price || 0) * item.quantity;
  }

  fieldInvalid(field: keyof AddressForm): boolean {
    return this.addressSubmitted && !String(this.addressForm[field] || '').trim();
  }

  addressStepComplete(): boolean {
    return this.checkoutStep === 'payment' || this.checkoutStep === 'confirmation';
  }

  paymentStepComplete(): boolean {
    return this.checkoutStep === 'confirmation';
  }

  async fetchAddressByCep(): Promise<void> {
    const cep = this.onlyDigits(this.addressForm.cep);

    if (cep.length !== 8) {
      return;
    }

    this.cepLoading = true;
    this.cepError = '';

    try {
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = await response.json();

      if (data?.erro) {
        this.cepError = 'CEP não encontrado. Confira os dados.';
        return;
      }

      this.addressForm.street = data.logradouro || this.addressForm.street;
      this.addressForm.neighborhood = data.bairro || this.addressForm.neighborhood;
      this.addressForm.city = data.localidade || this.addressForm.city;
      this.addressForm.state = data.uf || this.addressForm.state;
    } catch {
      this.cepError = 'Não foi possível buscar o CEP agora.';
    } finally {
      this.cepLoading = false;
    }
  }

  continueToPayment(): void {
    this.addressSubmitted = true;
    this.checkoutError = '';

    if (!this.isAddressValid()) {
      this.checkoutError = 'Preencha os campos obrigatórios para continuar.';
      return;
    }

    this.checkoutStep = 'payment';
    this.resetPixPayment();
    setTimeout(() => void this.renderSelectedPaymentMethod());
  }

  selectPaymentMethod(method: 'card' | 'pix'): void {
    if (this.selectedPaymentMethod === method) {
      return;
    }

    this.selectedPaymentMethod = method;
    this.checkoutError = '';
    this.paymentStatus = '';
    this.resetPixPayment();
    this.resetPaymentBrick();

    if (method === 'card') {
      setTimeout(() => void this.renderPaymentBrick());
    }
  }

  async generatePixPayment(): Promise<void> {
    if (!this.cartItems.length || this.isCheckingOut) {
      return;
    }

    this.isCheckingOut = true;
    this.checkoutError = '';
    this.pixCopyStatus = '';
    this.paymentStatus = 'Gerando Pix...';

    try {
      const user = this.authService.currentUser || await this.authService.waitForAuthState();

      if (!user) {
        throw new Error('Não foi possível identificar o usuário autenticado.');
      }

      const idToken = await user.getIdToken();
      const payment = await firstValueFrom(
        this.http.post<MercadoPagoPaymentResponse>(`${this.apiBaseUrl}/checkout/create-pix-payment`, {
          payment: {
            fullName: this.addressForm.fullName,
            email: this.addressForm.email,
            cpf: this.addressForm.cpf,
            payer: {
              email: this.addressForm.email,
              identification: {
                type: 'CPF',
                number: this.onlyDigits(this.addressForm.cpf),
              },
            },
            shippingAddress: { ...this.addressForm },
          },
          items: this.checkoutItemsPayload(),
          shipping: this.shipping(),
          storeId: this.activeStore?.id,
        }, {
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        }),
      );

      this.pixPayment = payment;
      this.paymentStatus = payment.status === 'approved'
        ? 'Pagamento aprovado. Pedido recebido!'
        : 'Aguardando pagamento. Após pagar, a confirmação pode levar alguns instantes.';

      if (payment.status === 'approved') {
        this.checkoutStep = 'confirmation';
        this.clearCart();
        this.metaPixel.trackPageView();
        return;
      }

      this.orderService.createOrder({
        id: String(payment.externalReference || payment.paymentId || payment.id),
        userId: user.uid,
        items: this.cartItems.map((item) => this.cartItemToOrderItem(item)),
        total: this.orderTotal(),
        status: 'pending',
        paymentId: String(payment.paymentId || payment.id || ''),
        externalReference: payment.externalReference,
        paymentMethodId: 'pix',
        pix: payment.pix,
      });
    } catch (error) {
      this.paymentStatus = '';
      this.checkoutError = `Não foi possível gerar o Pix: ${this.getErrorMessage(error)}`;
    } finally {
      this.isCheckingOut = false;
    }
  }

  async copyPixCode(): Promise<void> {
    const code = this.pixPayment?.pix?.qrCode || '';

    if (!code) {
      return;
    }

    try {
      await navigator.clipboard.writeText(code);
      this.pixCopyStatus = 'Código Pix copiado.';
    } catch {
      this.pixCopyStatus = 'Não foi possível copiar automaticamente.';
    }
  }

  async submitCheckoutPayment(formData: Record<string, unknown>): Promise<void> {
    if (!this.cartItems.length || this.isCheckingOut) {
      return;
    }

    this.isCheckingOut = true;
    this.checkoutError = '';
    this.paymentStatus = 'Processando pagamento...';

    try {
      const user = this.authService.currentUser || await this.authService.waitForAuthState();

      if (!user) {
        throw new Error('Não foi possível identificar o usuário autenticado.');
      }

      const idToken = await user.getIdToken();
      const payer = this.toRecord(formData['payer']);
      const payment = await firstValueFrom(
        this.http.post<MercadoPagoPaymentResponse>(`${this.apiBaseUrl}/checkout/process-payment`, {
          payment: {
            ...formData,
            payer: {
              ...payer,
              email: this.addressForm.email,
            },
            shippingAddress: { ...this.addressForm },
          },
          items: this.checkoutItemsPayload(),
          shipping: this.shipping(),
          storeId: this.activeStore?.id,
        }, {
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        }),
      );

      if (payment.status === 'approved') {
        const purchaseValue = this.orderTotal();
        const purchasedProductIds = this.cartItems.map((item) => this.productPixelId(item.product));
        const purchasedItems: OrderItem[] = this.cartItems.map((item) => this.cartItemToOrderItem(item));
        try {
          this.orderService.createOrder({
            id: String(payment.externalReference || payment.id),
            userId: user.uid,
            items: purchasedItems,
            total: purchaseValue,
            status: 'paid',
            paymentId: String(payment.id),
            externalReference: payment.externalReference,
          });
        } catch {
          this.paymentStatus = 'Pagamento aprovado, mas o pedido ainda não foi salvo no histórico.';
          this.checkoutError = 'Não foi possível salvar o pedido. Seu carrinho foi preservado para recuperação.';
          this.checkoutStep = 'confirmation';
          this.resetPaymentBrick();
          return;
        }

        this.paymentStatus = 'Pagamento aprovado. Pedido recebido!';
        this.checkoutStep = 'confirmation';
        this.resetPaymentBrick();
        this.metaPixel.trackEvent('Purchase', {
          value: purchaseValue,
          currency: 'BRL',
          content_ids: purchasedProductIds,
          content_type: 'product',
        });
        this.clearCart();
        this.metaPixel.trackPageView();
        return;
      }

      if (payment.status === 'pending' || payment.status === 'in_process') {
        this.paymentStatus = 'Pagamento recebido e em análise.';
        this.checkoutStep = 'confirmation';
        this.resetPaymentBrick();
        this.metaPixel.trackPageView();
        return;
      }

      this.paymentStatus = '';
      this.checkoutError = 'Pagamento recusado. Revise os dados e tente novamente.';
    } catch (error) {
      this.paymentStatus = '';
      this.checkoutError = `Não foi possível processar o pagamento: ${this.getErrorMessage(error)}`;
    } finally {
      this.isCheckingOut = false;
    }
  }

  private checkoutItemsPayload(): Array<Record<string, unknown>> {
    return this.cartItems.map((item) => ({
      id: item.product.id || item.product.name,
      title: `${item.product.name}${item.product.color ? ` - ${item.product.color}` : ''}`,
      quantity: item.quantity,
      unit_price: Number(item.product.price || 0),
      image: item.product.image,
      selectedColor: item.product.color || null,
      selectedSize: item.product.selectedSize,
      selectedGender: item.product.selectedGender,
    }));
  }

  private cartItemToOrderItem(item: CartItem): OrderItem {
    return {
      productId: String(item.product.id || item.product.slug || item.product.sku || item.product.name),
      name: item.product.name,
      quantity: item.quantity,
      price: Number(item.product.price || 0),
      size: item.product.selectedSize,
      gender: item.product.selectedGender,
      color: item.product.color,
      image: item.product.image,
    };
  }

  private ensureRouteData(): Promise<void> {
    if (this.isAuthRoute || this.isCheckoutView) {
      return Promise.resolve();
    }

    if (this.isCatalogView) {
      return this.loadCatalogProducts();
    }

    const forceReload = this.reloadHomeOnNextEnsure;
    this.reloadHomeOnNextEnsure = false;
    return this.loadHomeProducts(forceReload);
  }

  private loadHomeProducts(forceReload = false): Promise<void> {
    if (this.homeLoadPromise) {
      return this.homeLoadPromise;
    }

    if (!forceReload && this.homeLoaded && this.hasHomeData()) {
      this.rehydrateHomeView();
      return Promise.resolve();
    }

    this.homeLoadPromise = this.fetchHomeProducts().finally(() => {
      this.homeLoadPromise = undefined;
    });
    return this.homeLoadPromise;
  }

  private async fetchHomeProducts(): Promise<void> {
    this.resetHomeViewState({ keepLoading: true });
    this.isLoadingHome = true;
    this.loadingCategoryKey = this.homeCategories[0]?.key || null;
    this.catalogMessage = '';
    this.catalogTone = '';

    try {
      const store = this.activeStore || await this.findCopaStore();

      if (!store) {
        await this.revealHomeCategoryErrors(`A loja "${this.storeName}" não foi encontrada na API.`);
        return;
      }

      this.activeStore = store;
      const { categories, products } = await firstValueFrom(
        forkJoin({
          categories: this.categoryService.getPublicCategories(),
          products: this.productService.getProducts({ storeId: store.id, status: 'active' }),
        }).pipe(finalize(() => {
          this.categoryService.clearCache();
        })),
      );
      this.catalogCategories = categories.filter((category) => category.active !== false);
      this.catalogCategoryError = '';
      this.homeCategoryCatalogMap = this.mapHomeCategories(this.catalogCategories);
      const sourceProducts = (products as Product[]).map((product, index) => this.normalizeProductIdentity(product, index));

      this.products = sourceProducts;

      for (const category of this.homeCategories) {
        const skeletonStartedAt = Date.now();
        this.loadingCategoryKey = category.key;
        await this.waitForMinimumHomeSkeleton(skeletonStartedAt);
        const categoryProducts = sourceProducts
          .filter((product) => this.productMatchesHomeCategory(product, category))
          .slice(0, this.maxHomeProductsPerCategory);
        this.homeCategoryProducts = {
          ...this.homeCategoryProducts,
          [category.key]: categoryProducts,
        };
        this.homeCategoryErrors = {
          ...this.homeCategoryErrors,
          [category.key]: '',
        };
        this.visibleCategoryKeys = [...this.visibleCategoryKeys, category.key];
        this.activeProducts = this.visibleCategoryKeys.flatMap((key) => this.homeCategoryProducts[key]);
        this.renderDynamicSections(this.activeProducts);
        setTimeout(() => this.reactivateHomeVisuals());
      }
    } catch {
      await this.revealHomeCategoryErrors('Não foi possível carregar as camisetas desta categoria.');
    } finally {
      this.products = this.activeProducts;
      this.productCardImagesCache.clear();
      this.renderDynamicSections(this.activeProducts);
      this.homeLoaded = true;
      this.loadingCategoryKey = null;
      this.isLoadingHome = false;
      setTimeout(() => this.reactivateHomeVisuals());
    }
  }

  private hasHomeData(): boolean {
    return Boolean(
      this.activeStore
      && this.visibleCategoryKeys.length === this.homeCategories.length,
    );
  }

  private resetHomeViewState(options: { keepLoading?: boolean } = {}): void {
    this.stopProductCardCarousel();
    this.productCardImagesCache.clear();
    this.visibleCategoryKeys = [];
    this.loadingCategoryKey = null;
    this.isLoadingHome = Boolean(options.keepLoading);
    this.homeCategoryProducts = this.emptyHomeCategoryProducts();
    this.homeCategoryErrors = this.emptyHomeCategoryErrors();
    this.homeCategoryCatalogMap = this.emptyHomeCategoryCatalogMap();
    this.activeProducts = [];
    this.featuredProduct = null;
    this.editorialProducts = [null, null];
    this.lookbookProducts = [null, null, null, null];
  }

  private showHomeSkeletonState(): void {
    this.resetHomeViewState({ keepLoading: true });
    this.catalogMessage = '';
    this.catalogTone = '';
    this.isLoadingHome = true;
    this.loadingCategoryKey = this.homeCategories[0]?.key || null;
  }

  private rehydrateHomeView(): void {
    this.stopProductCardCarousel();
    this.productCardImagesCache.clear();
    this.activeProducts = this.homeCategories.flatMap((category) => this.homeCategoryProducts[category.key]);
    this.products = this.activeProducts;
    this.renderDynamicSections(this.activeProducts);
    setTimeout(() => this.reactivateHomeVisuals());
  }

  private async revealHomeCategoryErrors(message: string): Promise<void> {
    for (const category of this.homeCategories) {
      const skeletonStartedAt = Date.now();
      this.loadingCategoryKey = category.key;
      await this.waitForMinimumHomeSkeleton(skeletonStartedAt);
      this.homeCategoryErrors = {
        ...this.homeCategoryErrors,
        [category.key]: message,
      };
      this.visibleCategoryKeys = [...this.visibleCategoryKeys, category.key];
    }
  }

  private async waitForMinimumHomeSkeleton(startedAt: number): Promise<void> {
    const elapsed = Date.now() - startedAt;
    const remaining = this.minimumHomeSkeletonMs - elapsed;

    if (remaining > 0) {
      await new Promise((resolve) => window.setTimeout(resolve, remaining));
    }
  }

  private loadCatalogProducts(): Promise<void> {
    if (this.catalogLoaded) {
      this.applyCatalogCategoryFromUrl();
      return Promise.resolve();
    }

    this.catalogLoadPromise ??= this.fetchCatalogProducts().finally(() => {
      this.catalogLoadPromise = undefined;
    });
    return this.catalogLoadPromise;
  }

  private async fetchCatalogProducts(): Promise<void> {
    this.loading = true;
    this.catalogMessage = '';
    this.catalogTone = '';

    try {
      const store = await this.findCopaStore();

      if (!store) {
        this.showMessage(`A loja "${this.storeName}" não foi encontrada na API.`, 'error');
        return;
      }

      this.activeStore = store;
      await this.loadPublicCategories();
      const products = await firstValueFrom(
        this.productService.getProducts({ storeId: store.id, status: 'active' }),
      );

      this.products = (products as Product[]).map((product, index) => this.normalizeProductIdentity(product, index));
      const activeCatalogProducts = this.products;
      this.catalogProducts = activeCatalogProducts;
      this.applyCatalogCategoryFromUrl();
      this.updateCatalogFilters();
      this.productCardImagesCache.clear();
      this.catalogLoaded = true;
    } catch {
      this.catalogProducts = [];
      this.filteredCatalogProducts = [];
      this.catalogMessage = 'Não foi possível carregar o catálogo da API.';
      this.catalogTone = 'error';
    } finally {
      this.loading = false;
    }
  }

  private async loadPublicCategories(): Promise<CatalogCategory[]> {
    try {
      this.catalogCategories = (await firstValueFrom(this.categoryService.getPublicCategories()))
        .filter((category) => category.active !== false);
      this.catalogCategoryError = '';
      return this.catalogCategories;
    } catch (error) {
      this.catalogCategories = [];
      this.catalogCategoryError = 'Não foi possível carregar as categorias.';
      throw error;
    }
  }

  private applyCatalogCategoryFromUrl(): void {
    const query = this.router.url.split('?')[1] || '';
    const categoryId = new URLSearchParams(query).get('categoryId') || '';
    this.selectedCatalogCategory = this.catalogCategories.some((category) => category.id === categoryId)
      ? categoryId
      : '';
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
    this.activeStore = null;
    this.activeProducts = [];
    this.catalogProducts = [];
    this.filteredCatalogProducts = [];
    this.visibleCategoryKeys = [];
    this.loadingCategoryKey = null;
    this.homeCategoryProducts = this.emptyHomeCategoryProducts();
    this.homeCategoryErrors = this.emptyHomeCategoryErrors();
    this.catalogMessage = message;
    this.catalogTone = tone;
  }

  private emptyHomeCategoryProducts(): Record<HomeCategoryKey, Product[]> {
    return {
      jogadores: [],
      artistas: [],
      fashion: [],
    };
  }

  private emptyHomeCategoryErrors(): Record<HomeCategoryKey, string> {
    return {
      jogadores: '',
      artistas: '',
      fashion: '',
    };
  }

  private emptyHomeCategoryCatalogMap(): Record<HomeCategoryKey, CatalogCategory | null> {
    return {
      jogadores: null,
      artistas: null,
      fashion: null,
    };
  }

  private mapHomeCategories(categories: CatalogCategory[]): Record<HomeCategoryKey, CatalogCategory | null> {
    return this.homeCategories.reduce((mappedCategories, category) => ({
      ...mappedCategories,
      [category.key]: categories.find((catalogCategory) => this.catalogCategoryMatchesHomeCategory(catalogCategory, category)) || null,
    }), this.emptyHomeCategoryCatalogMap());
  }

  private catalogCategoryMatchesHomeCategory(catalogCategory: CatalogCategory, homeCategory: HomeCategory): boolean {
    const expectedValues = new Set([
      this.normalizeCategoryName(homeCategory.key),
      this.normalizeCategoryName(homeCategory.label),
    ]);
    const normalizedName = this.normalizeCategoryName(catalogCategory.name);
    const normalizedSlug = this.normalizeCategoryName(String(catalogCategory.slug || '').replace(/-/g, ' '));

    return expectedValues.has(normalizedName) || expectedValues.has(normalizedSlug);
  }


  private productCategoryNames(product: Product): string[] {
    const names = new Set<string>();

    const addCategory = (category: unknown): void => {
      if (typeof category === 'string') {
        const value = category.trim();

        if (value) {
          names.add(value);
        }

        return;
      }

      if (category && typeof category === 'object') {
        const record = category as Record<string, unknown>;
        const value = String(record['name'] || record['title'] || record['label'] || record['value'] || '').trim();

        if (value) {
          names.add(value);
        }
      }
    };

    addCategory(product.category);

    if (Array.isArray(product.categories)) {
      product.categories.forEach(addCategory);
    }

    return Array.from(names);
  }

  private normalizeCategoryName(category: string): string {
    return category
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('pt-BR')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private variationImage(
    source: ProductColorVariation | Product | null,
    side: 'front' | 'back',
  ): string {
    if (!source) {
      return '';
    }

    if (this.selectedProductGender === 'Feminino') {
      return side === 'back'
        ? source.imageBackFemale || source.imageBack || ''
        : source.imageFemale || source.image || '';
    }

    return side === 'back' ? source.imageBack || '' : source.image || '';
  }

  private productMatchesCategory(product: Product, category: CatalogCategory): boolean {
    const categoryIds = new Set([
      String(product.categoryId || ''),
      ...(Array.isArray(product.categoryIds) ? product.categoryIds.map(String) : []),
    ].filter(Boolean));
    const categoryNames = new Set(this.productCategoryNames(product).map((name) => this.normalizeCategoryName(name)));
    const categorySlugs = new Set<string>();

    if (Array.isArray(product.categories)) {
      product.categories.forEach((value) => {
        if (value && typeof value === 'object') {
          if (value.id) {
            categoryIds.add(String(value.id));
          }

          if (value.slug) {
            categorySlugs.add(this.normalizeCategoryName(value.slug.replace(/-/g, ' ')));
          }
        }
      });
    }

    return categoryIds.has(category.id)
      || categoryNames.has(this.normalizeCategoryName(category.name))
      || categorySlugs.has(this.normalizeCategoryName(String(category.slug || '').replace(/-/g, ' ')));
  }

  private productMatchesHomeCategory(product: Product, homeCategory: HomeCategory): boolean {
    const catalogCategory = this.homeCategoryCatalog(homeCategory.key);
    const expectedNames = new Set([
      this.normalizeCategoryName(homeCategory.key),
      this.normalizeCategoryName(homeCategory.label),
    ]);
    const productNames = this.productCategoryNames(product).map((name) => this.normalizeCategoryName(name));
    const productCategoryIds = new Set([
      String(product.categoryId || ''),
      ...(Array.isArray(product.categoryIds) ? product.categoryIds.map(String) : []),
    ].filter(Boolean));
    const productCategorySlugs = new Set<string>();

    if (Array.isArray(product.categories)) {
      product.categories.forEach((value) => {
        if (value && typeof value === 'object') {
          if (value.id) {
            productCategoryIds.add(String(value.id));
          }

          if (value.slug) {
            productCategorySlugs.add(this.normalizeCategoryName(value.slug.replace(/-/g, ' ')));
          }
        }
      });
    }

    if (catalogCategory?.id && productCategoryIds.has(catalogCategory.id)) {
      return true;
    }

    if (
      catalogCategory?.slug
      && productCategorySlugs.has(this.normalizeCategoryName(catalogCategory.slug.replace(/-/g, ' ')))
    ) {
      return true;
    }

    return productNames.some((name) => expectedNames.has(name))
      || productCategorySlugs.has(this.normalizeCategoryName(homeCategory.key))
      || productCategorySlugs.has(this.normalizeCategoryName(homeCategory.label));
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

  private getProductKey(product: Product): string {
    return `${this.getBaseProductKey(product)}::${product.colorId || product.color || ''}::${product.selectedSize || 'M'}::${product.selectedGender || 'Masculino'}`;
  }

  private productPixelId(product: Product): string {
    return String(product.id || product.slug || product.sku || product.name);
  }

  private productPixelParams(product: Product): Record<string, unknown> {
    return {
      content_ids: [this.productPixelId(product)],
      content_name: product.name,
      content_type: 'product',
      value: Number(product.price || 0),
      currency: 'BRL',
    };
  }

  private getBaseProductKey(product: Product): string {
    return String(product.id || product.slug || product.sku || product.name);
  }

  private normalizeProductIdentity(product: Product, index: number): Product {
    if (product.id) {
      return product;
    }

    return {
      ...product,
      id: String(product.slug || product.sku || product.name || `product-${index}`),
    };
  }

  private clearProductCardImageCache(product: Product): void {
    const prefix = `${this.getBaseProductKey(product)}::`;

    for (const key of this.productCardImagesCache.keys()) {
      if (key.startsWith(prefix)) {
        this.productCardImagesCache.delete(key);
      }
    }
  }

  private isAddressValid(): boolean {
    const requiredFields: Array<keyof AddressForm> = [
      'fullName',
      'email',
      'cpf',
      'cep',
      'street',
      'number',
      'neighborhood',
      'city',
      'state',
    ];

    const requiredFilled = requiredFields.every((field) => String(this.addressForm[field] || '').trim());
    return requiredFilled && this.onlyDigits(this.addressForm.cpf).length === 11 && this.onlyDigits(this.addressForm.cep).length === 8;
  }

  private renderSelectedPaymentMethod(): Promise<void> {
    if (this.selectedPaymentMethod !== 'card') {
      this.resetPaymentBrick();
      return Promise.resolve();
    }

    return this.renderPaymentBrick();
  }

  private async renderPaymentBrick(): Promise<void> {
    if (this.selectedPaymentMethod !== 'card' || this.cardPaymentBrickController || this.isCheckingOut || this.checkoutStep !== 'payment') {
      return;
    }

    if (!this.mercadoPagoPublicKey) {
      this.checkoutError = 'Configure a chave pública do Mercado Pago para habilitar o pagamento.';
      return;
    }

    if (!window.MercadoPago) {
      this.checkoutError = 'Não foi possível carregar o checkout do Mercado Pago. Tente novamente.';
      return;
    }

    this.isCheckingOut = true;

    try {
      await this.waitForPaymentBrickContainer();
      const mercadoPago = new window.MercadoPago(this.mercadoPagoPublicKey, { locale: 'pt-BR' });
      const bricksBuilder = mercadoPago.bricks();

      this.cardPaymentBrickController = await bricksBuilder.create('cardPayment', 'cardPaymentBrick_container', {
        initialization: {
          amount: Number(this.orderTotal().toFixed(2)),
          payer: {
            email: this.addressForm.email,
          },
        },
        customization: {
          visual: {
            style: {
              theme: 'default',
            },
          },
        },
        callbacks: {
          onReady: () => {
            this.checkoutError = '';
          },
          onSubmit: async (formData) => {
            await this.submitCheckoutPayment(formData);
          },
          onError: () => {
            this.checkoutError = 'Não foi possível validar os dados do pagamento.';
          },
        },
      });
    } catch (error) {
      this.checkoutError = `Não foi possível iniciar o pagamento: ${this.getErrorMessage(error)}`;
    } finally {
      this.isCheckingOut = false;
    }
  }

  private async waitForPaymentBrickContainer(): Promise<void> {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      if (document.getElementById('cardPaymentBrick_container')) {
        return;
      }

      await new Promise((resolve) => window.setTimeout(resolve, 50));
    }

    throw new Error('área do formulário de pagamento não foi encontrada.');
  }

  private resetPaymentBrick(): void {
    this.cardPaymentBrickController?.unmount?.();
    this.cardPaymentBrickController = null;
  }

  private resetPixPayment(): void {
    this.pixPayment = null;
    this.pixCopyStatus = '';
  }

  private syncViewWithRoute(url: string): void {
    const path = url.split('?')[0].split('#')[0];
    const previousPath = this.currentRoutePath;
    const homeRoute = this.isHomeRoute(path);
    const checkoutRoute = path === '/checkout';
    const catalogRoute = path === '/catalogo';
    const wasCheckoutView = this.isCheckoutView;

    this.currentRoutePath = path;
    this.isAuthRoute = [
      '/login',
      '/cadastro',
      '/minha-conta',
      '/minhas-compras',
    ].includes(path);
    this.isCheckoutView = checkoutRoute;
    this.isCatalogView = catalogRoute;
    this.accountMenuOpen = false;

    if (homeRoute || catalogRoute || this.isAuthRoute || checkoutRoute) {
      this.selectedProduct = null;
      this.selectedProductColorIndex = 0;
      this.selectedProductImageSide = 'front';
    }

    if (homeRoute && previousPath && !this.isHomeRoute(previousPath)) {
      this.reloadHomeOnNextEnsure = true;
      this.cartOpen = false;
      this.showHomeSkeletonState();
      this.forceHomeRevealVisibility();
    }

    if (checkoutRoute && !wasCheckoutView) {
      this.cartOpen = false;
      this.checkoutStep = 'address';
      this.checkoutError = '';
      this.paymentStatus = '';
      this.selectedPaymentMethod = 'card';
      this.resetPixPayment();
      this.resetPaymentBrick();
      this.metaPixel.trackEvent('InitiateCheckout', {
        value: this.orderTotal(),
        currency: 'BRL',
        num_items: this.cartQuantity(),
      });
    }

    if (!checkoutRoute && wasCheckoutView) {
      this.checkoutError = '';
      this.paymentStatus = '';
      this.resetPixPayment();
      this.resetPaymentBrick();
    }

    this.scrollToRouteTop(homeRoute);
  }

  private isHomeRoute(path: string): boolean {
    return path === '' || path === '/' || path === '/home';
  }

  private toRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object'
      ? value as Record<string, unknown>
      : {};
  }

  private readStoredCart(): CartItem[] {
    try {
      const value = window.localStorage.getItem(this.cartStorageKey);
      const cart = value ? JSON.parse(value) as unknown : [];

      if (!Array.isArray(cart)) {
        return [];
      }

      return cart.filter((item): item is CartItem => {
        if (!item || typeof item !== 'object') {
          return false;
        }

        const candidate = item as Partial<CartItem>;
        return Boolean(
          candidate.product &&
          typeof candidate.product === 'object' &&
          Number.isFinite(Number(candidate.quantity)) &&
          Number(candidate.quantity) > 0,
        );
      });
    } catch {
      return [];
    }
  }

  private persistCart(): void {
    try {
      window.localStorage.setItem(this.cartStorageKey, JSON.stringify(this.cartItems));
    } catch {
      // The cart remains usable in memory when browser storage is unavailable.
    }
  }

  private clearCart(): void {
    this.cartItems = [];
    this.lastAddedProductName = '';
    this.cartOpen = false;
    this.persistCart();
  }

  private getErrorMessage(error: unknown): string {
    if (typeof error === 'object' && error && 'error' in error) {
      const httpError = error as { error?: { error?: string } };
      if (httpError.error?.error) {
        return httpError.error.error;
      }
    }

    if (error instanceof Error && error.message) {
      return error.message;
    }

    if (typeof error === 'string' && error.trim()) {
      return error;
    }

    return 'verifique os dados e tente novamente.';
  }

  private onlyDigits(value: string): string {
    return String(value || '').replace(/\D/g, '');
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
    }, {
      threshold: 0.03,
      rootMargin: '0px 0px -8% 0px',
    });

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

  private reactivateHomeVisuals(): void {
    this.forceHomeRevealVisibility();
    this.initScrollAnimations();
    this.refreshParallax();
  }

  private scrollToRouteTop(homeRoute = false): void {
    window.requestAnimationFrame(() => {
      window.scrollTo({
        top: 0,
        left: 0,
        behavior: homeRoute || this.reducedMotion ? 'auto' : 'smooth',
      });
    });
  }

  private forceHomeRevealVisibility(): void {
    const root = this.elementRef.nativeElement;
    const elements = Array.from(root.querySelectorAll('.hero, .benefits.reveal, #shop.reveal, .product-category-section')) as HTMLElement[];
    elements.forEach((element) => element.classList.add('is-visible'));
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
