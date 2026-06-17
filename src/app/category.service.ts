import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, shareReplay } from 'rxjs';
import { environment } from '../environments/environment';

export interface CatalogCategory {
  id: string;
  name: string;
  slug?: string;
  active?: boolean;
}

@Injectable({ providedIn: 'root' })
export class CategoryService {
  private readonly http = inject(HttpClient);
  private categoriesRequest?: Observable<CatalogCategory[]>;

  getPublicCategories(): Observable<CatalogCategory[]> {
    this.categoriesRequest ??= this.http
      .get<CatalogCategory[]>(`${environment.apiBaseUrl}/categories/public`)
      .pipe(shareReplay({ bufferSize: 1, refCount: false }));

    return this.categoriesRequest;
  }

  clearCache(): void {
    this.categoriesRequest = undefined;
  }
}
