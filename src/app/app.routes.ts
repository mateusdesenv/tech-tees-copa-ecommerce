import { Routes } from '@angular/router';
import { authGuard } from './auth.guard';
import { EmptyRouteComponent } from './empty-route.component';

export const routes: Routes = [
  { path: '', component: EmptyRouteComponent, pathMatch: 'full' },
  {
    path: 'login',
    loadComponent: () => import('./login.component').then((module) => module.LoginComponent),
  },
  {
    path: 'cadastro',
    loadComponent: () => import('./register.component').then((module) => module.RegisterComponent),
  },
  {
    path: 'checkout',
    component: EmptyRouteComponent,
    canActivate: [authGuard],
  },
  {
    path: 'catalogo',
    component: EmptyRouteComponent,
  },
  {
    path: 'minha-conta',
    loadComponent: () => import('./account.component').then((module) => module.AccountComponent),
    canActivate: [authGuard],
  },
  {
    path: 'minhas-compras',
    loadComponent: () => import('./orders.component').then((module) => module.OrdersComponent),
    canActivate: [authGuard],
  },
  { path: '**', redirectTo: '' },
];
