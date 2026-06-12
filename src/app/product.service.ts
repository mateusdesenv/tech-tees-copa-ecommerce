import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../environments/environment';

export interface ProductQuery {
  storeId: string;
  categoryId?: string;
  page?: number;
  limit?: number;
  status?: string;
}

@Injectable({ providedIn: 'root' })
export class ProductService {
  private readonly http = inject(HttpClient);
  private readonly productsUrl = `${environment.apiBaseUrl}/products`;

  getProducts(query: ProductQuery): Observable<unknown[]> {
    let params = new HttpParams().set('storeId', query.storeId);

    if (query.categoryId) {
      params = params.set('categoryId', query.categoryId);
    }

    if (query.page) {
      params = params.set('page', query.page);
    }

    if (query.limit) {
      params = params.set('limit', query.limit);
    }

    if (query.status) {
      params = params.set('status', query.status);
    }

    return this.http.get<unknown[]>(this.productsUrl, { params });
  }
}
