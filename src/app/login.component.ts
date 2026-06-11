import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from './auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './auth-pages.css',
})
export class LoginComponent {
  private readonly authService = inject(AuthService);
  readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  email = '';
  password = '';
  loading = false;
  errorMessage = '';
  readonly firebaseConfigured = this.authService.isConfigured;
  readonly checkoutReason = this.route.snapshot.queryParamMap.get('reason') === 'checkout';

  async submit(): Promise<void> {
    if (!this.email.trim() || !this.password) {
      this.errorMessage = 'Preencha e-mail e senha.';
      return;
    }

    await this.authenticate(() => this.authService.login(this.email, this.password));
  }

  async loginWithGoogle(): Promise<void> {
    await this.authenticate(() => this.authService.loginWithGoogle());
  }

  private async authenticate(action: () => Promise<unknown>): Promise<void> {
    if (!this.firebaseConfigured || this.loading) {
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    try {
      await action();
      await this.router.navigateByUrl(this.returnUrl());
    } catch (error) {
      this.errorMessage = this.authService.authErrorMessage(error);
    } finally {
      this.loading = false;
    }
  }

  private returnUrl(): string {
    const value = this.route.snapshot.queryParamMap.get('returnUrl') || '/';
    return value.startsWith('/') ? value : '/';
  }
}
