import { Injectable } from '@angular/core';
import { environment } from '../environments/environment';

type GtagCommand = 'config' | 'event' | 'js';
type GtagParameters = Record<string, unknown> | Date | string;

interface GtagFunction {
  (command: GtagCommand, target: string | Date, params?: GtagParameters): void;
}

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: GtagFunction;
  }
}

@Injectable({ providedIn: 'root' })
export class GoogleAnalyticsService {
  private readonly measurementId = String(environment.firebase?.measurementId || '').trim();
  private initialized = false;
  private lastTrackedPath = '';

  init(): void {
    if (!this.measurementId || this.initialized || typeof window === 'undefined') {
      return;
    }

    window.dataLayer = window.dataLayer || [];

    if (!window.gtag) {
      window.gtag = ((...args: unknown[]) => {
        window.dataLayer?.push(args);
      }) as GtagFunction;
    }

    this.initialized = true;
    this.lastTrackedPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  }

  trackPageView(path: string, title?: string): void {
    if (!this.initialized || !window.gtag || !path.trim()) {
      return;
    }

    if (path === this.lastTrackedPath) {
      return;
    }

    this.lastTrackedPath = path;
    window.gtag('event', 'page_view', {
      page_path: path,
      page_location: `${window.location.origin}${path}`,
      page_title: title || (typeof document !== 'undefined' ? document.title : 'Tech Tees Brasil'),
      send_to: this.measurementId,
    });
  }
}
