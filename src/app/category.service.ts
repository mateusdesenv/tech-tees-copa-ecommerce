import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
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

  getPublicCategories(): Observable<CatalogCategory[]> {
    return this.http.get<CatalogCategory[]>(`${environment.apiBaseUrl}/categories/public`);
  }
}
