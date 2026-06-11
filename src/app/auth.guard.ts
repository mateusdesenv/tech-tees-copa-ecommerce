import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = (_route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.currentUser) {
    return true;
  }

  return authService.user$.pipe(
    map((user) => user
      ? true
      : router.createUrlTree(['/login'], {
          queryParams: {
            returnUrl: state.url,
            ...(state.url.startsWith('/checkout') ? { reason: 'checkout' } : {}),
          },
        })),
  );
};
