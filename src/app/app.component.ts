import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { AfterViewInit, Component, ElementRef, OnDestroy, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../environments/environment';

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
  initialization: { amount: number };
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
  color?: string;
  colorId?: string;
  colorHex?: string;
  colorRgb?: ColorRgb | null;
  colors?: ProductColorVariation[];
  category?: string;
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
}

interface CartItem {
  product: Product;
  quantity: number;
}

type CheckoutStep = 'address' | 'payment' | 'confirmation';

interface AddressForm {
  fullName: string;
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
  status: string;
  statusDetail?: string;
  paymentMethodId?: string;
  externalReference: string;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent implements AfterViewInit, OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly elementRef: ElementRef<HTMLElement> = inject(ElementRef);

  readonly apiBaseUrl = environment.apiBaseUrl;
  readonly mercadoPagoPublicKey = environment.mercadoPagoPublicKey;
  readonly storeName = environment.storeName;
  readonly storeSlug = environment.storeSlug;
  readonly fallbackImage = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 800 1000%22%3E%3Crect width=%22800%22 height=%221000%22 fill=%22%23eee8dc%22/%3E%3Ctext x=%22400%22 y=%22500%22 text-anchor=%22middle%22 font-family=%22Arial%22 font-size=%2232%22 font-weight=%22700%22 fill=%22%236d675d%22%3ETECH-TEES%3C/text%3E%3C/svg%3E';

  loading = true;
  catalogMessage = '';
  catalogTone: 'error' | '' = '';
  products: Product[] = [];
  activeProducts: Product[] = [];
  activeStore: StoreResponse | null = null;
  selectedProduct: Product | null = null;
  selectedProductColorIndex = 0;
  selectedProductImageSide: 'front' | 'back' = 'front';
  featuredProduct: Product | null = null;
  editorialProducts: Array<Product | null> = [null, null];
  lookbookProducts: Array<Product | null> = [null, null, null, null];
  skeletonItems = Array.from({ length: 8 });
  cartItems: CartItem[] = [];
  lastAddedProductName = '';
  cartOpen = false;
  isCheckoutView = false;
  checkoutStep: CheckoutStep = 'address';
  addressSubmitted = false;
  cepLoading = false;
  cepError = '';
  checkoutError = '';
  paymentStatus = '';
  isCheckingOut = false;
  hoverCarouselTick = 0;
  cardColorSelection: Record<string, number> = {};
  selectedProductSize: ProductSize = 'M';
  selectedProductGender: ProductGender = 'Masculino';
  readonly productSizes: ProductSize[] = ['P', 'M', 'G'];
  readonly productGenders: ProductGender[] = ['Masculino', 'Feminino'];
  readonly addressForm: AddressForm = {
    fullName: '',
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

    if (this.hoverCarouselIntervalId) {
      window.clearInterval(this.hoverCarouselIntervalId);
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

    this.lastAddedProductName = product.name;
  }

  addCardProductToCart(product: Product): void {
    this.addToCart(this.productWithCardDefaults(product));
  }

  productColors(product: Product): ProductColorVariation[] {
    const variations = Array.isArray(product.colors)
      ? product.colors.filter((variation) => variation.color || variation.colorId || variation.image || variation.imageBack)
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

  trackByIndex(index: number): number {
    return index;
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
    window.scrollTo({ top: 0, behavior: this.reducedMotion ? 'auto' : 'smooth' });
  }

  closeProduct(): void {
    this.selectedProduct = null;
    this.selectedProductColorIndex = 0;
    this.selectedProductImageSide = 'front';
    window.scrollTo({ top: 0, behavior: this.reducedMotion ? 'auto' : 'smooth' });
  }

  selectProductImageSide(side: 'front' | 'back'): void {
    if (side === 'back' && !this.selectedProductColor()?.imageBack) {
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

    if (this.selectedProductImageSide === 'back' && !colors[index].imageBack) {
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

    if (this.selectedProductImageSide === 'back' && selectedColor?.imageBack) {
      return selectedColor.imageBack;
    }

    return selectedColor?.image || this.selectedProduct.image || this.fallbackImage;
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
      image: variation.image || this.selectedProduct.image,
      imageBack: variation.imageBack || this.selectedProduct.imageBack,
      selectedSize: this.selectedProductSize,
      selectedGender: this.selectedProductGender,
    };
  }

  goToCheckout(): void {
    if (!this.cartItems.length) {
      return;
    }

    if (!this.cartItems.every((item) => item.product.selectedSize && item.product.selectedGender)) {
      this.checkoutError = 'Selecione tamanho e gênero para todos os itens.';
      return;
    }

    this.cartOpen = false;
    this.selectedProduct = null;
    this.selectedProductColorIndex = 0;
    this.selectedProductImageSide = 'front';
    this.isCheckoutView = true;
    this.checkoutStep = 'address';
    this.checkoutError = '';
    this.paymentStatus = '';
    this.resetPaymentBrick();
    window.scrollTo({ top: 0, behavior: this.reducedMotion ? 'auto' : 'smooth' });
  }

  backToStore(): void {
    this.isCheckoutView = false;
    this.selectedProduct = null;
    this.selectedProductColorIndex = 0;
    this.selectedProductImageSide = 'front';
    this.checkoutError = '';
    this.paymentStatus = '';
    this.resetPaymentBrick();
    window.scrollTo({ top: 0, behavior: this.reducedMotion ? 'auto' : 'smooth' });
  }

  openCart(): void {
    this.cartOpen = true;
  }

  closeCart(): void {
    this.cartOpen = false;
  }

  increaseCartItem(item: CartItem): void {
    item.quantity += 1;
  }

  decreaseCartItem(item: CartItem): void {
    if (item.quantity <= 1) {
      this.removeCartItem(item);
      return;
    }

    item.quantity -= 1;
  }

  removeCartItem(item: CartItem): void {
    const productKey = this.getProductKey(item.product);
    this.cartItems = this.cartItems.filter((cartItem) => this.getProductKey(cartItem.product) !== productKey);

    if (this.cartItems.length === 0) {
      this.closeCart();
      this.isCheckoutView = false;
      this.resetPaymentBrick();
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
    setTimeout(() => void this.renderPaymentBrick());
  }

  async submitCheckoutPayment(formData: Record<string, unknown>): Promise<void> {
    if (!this.cartItems.length || this.isCheckingOut) {
      return;
    }

    this.isCheckingOut = true;
    this.checkoutError = '';
    this.paymentStatus = 'Processando pagamento...';

    try {
      const payment = await firstValueFrom(
        this.http.post<MercadoPagoPaymentResponse>(`${this.apiBaseUrl}/checkout/process-payment`, {
          payment: {
            ...formData,
            shippingAddress: { ...this.addressForm },
          },
          items: this.cartItems.map((item) => ({
            id: item.product.id || item.product.name,
            title: `${item.product.name}${item.product.color ? ` - ${item.product.color}` : ''}`,
            quantity: item.quantity,
            unit_price: Number(item.product.price || 0),
            image: item.product.image,
            selectedColor: item.product.color || null,
            selectedSize: item.product.selectedSize,
            selectedGender: item.product.selectedGender,
          })),
          shipping: this.shipping(),
          storeId: this.activeStore?.id,
        }),
      );

      if (payment.status === 'approved') {
        this.paymentStatus = 'Pagamento aprovado. Pedido recebido!';
        this.checkoutStep = 'confirmation';
        this.resetPaymentBrick();
        return;
      }

      if (payment.status === 'pending' || payment.status === 'in_process') {
        this.paymentStatus = 'Pagamento recebido e em análise.';
        this.checkoutStep = 'confirmation';
        this.resetPaymentBrick();
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

      this.activeStore = store;
      const products = await firstValueFrom(
        this.http.get<Product[]>(`${this.apiBaseUrl}/products?storeId=${encodeURIComponent(store.id)}`),
      );

      this.products = products.map((product, index) => this.normalizeProductIdentity(product, index));
      this.activeProducts = this.products.filter((product) => product.status === 'active');
      this.productCardImagesCache.clear();

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
    this.activeStore = null;
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

  private getProductKey(product: Product): string {
    return `${this.getBaseProductKey(product)}::${product.colorId || product.color || ''}::${product.selectedSize || 'M'}::${product.selectedGender || 'Masculino'}`;
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

  private async renderPaymentBrick(): Promise<void> {
    if (this.cardPaymentBrickController || this.isCheckingOut || this.checkoutStep !== 'payment') {
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
