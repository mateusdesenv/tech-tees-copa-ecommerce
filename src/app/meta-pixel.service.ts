import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { environment } from '../environments/environment';

type MetaPixelCommand = 'init' | 'track' | 'trackCustom';

interface MetaPixelFunction {
  (command: MetaPixelCommand, eventOrPixelId: string, params?: Record<string, unknown>): void;
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[][];
  push: (...args: unknown[]) => void;
  loaded: boolean;
  version: string;
}

declare global {
  interface Window {
    fbq?: MetaPixelFunction;
    _fbq?: MetaPixelFunction;
  }
}

@Injectable({ providedIn: 'root' })
export class MetaPixelService {
  private readonly document = inject(DOCUMENT);
  private readonly pixelId = String(environment.pixelId || '').trim();
  private initialized = false;

  init(): void {
    if (!this.pixelId || this.initialized || typeof window === 'undefined') {
      return;
    }

    this.installQueue();
    this.loadScript();
    window.fbq?.('init', this.pixelId);
    this.initialized = true;
    this.trackPageView();
  }

  trackPageView(): void {
    this.trackEvent('PageView');
  }

  trackEvent(eventName: string, params?: Record<string, unknown>): void {
    if (!this.initialized || !window.fbq || !eventName.trim()) {
      return;
    }

    if (params) {
      window.fbq('track', eventName, params);
      return;
    }

    window.fbq('track', eventName);
  }

  private installQueue(): void {
    if (window.fbq) {
      return;
    }

    const fbq = ((...args: unknown[]) => {
      if (fbq.callMethod) {
        fbq.callMethod(...args);
        return;
      }

      fbq.queue.push(args);
    }) as MetaPixelFunction;

    fbq.push = (...args: unknown[]) => fbq(...args as [MetaPixelCommand, string, Record<string, unknown>?]);
    fbq.loaded = true;
    fbq.version = '2.0';
    fbq.queue = [];
    window.fbq = fbq;
    window._fbq = fbq;
  }

  private loadScript(): void {
    const scriptId = 'meta-pixel-script';

    if (this.document.getElementById(scriptId)
      || this.document.querySelector('script[src="https://connect.facebook.net/en_US/fbevents.js"]')) {
      return;
    }

    const script = this.document.createElement('script');
    script.id = scriptId;
    script.async = true;
    script.src = 'https://connect.facebook.net/en_US/fbevents.js';
    this.document.head.appendChild(script);
  }
}
