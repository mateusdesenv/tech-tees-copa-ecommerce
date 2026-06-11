import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from './auth.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './register.component.html',
  styleUrl: './auth-pages.css',
})
export class RegisterComponent {
  private readonly authService = inject(AuthService);
  readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  name = '';
  email = '';
  password = '';
  passwordConfirmation = '';
  loading = false;
  errorMessage = '';
  readonly firebaseConfigured = this.authService.isConfigured;

  async submit(): Promise<void> {
    this.errorMessage = '';

    if (!this.name.trim() || !this.email.trim() || !this.password) {
      this.errorMessage = 'Preencha todos os campos obrigatórios.';
      return;
    }

    if (this.password.length < 6) {
      this.errorMessage = 'A senha deve ter pelo menos 6 caracteres.';
      return;
    }

    if (this.password !== this.passwordConfirmation) {
      this.errorMessage = 'As senhas não coincidem.';
      return;
    }

    if (!this.firebaseConfigured || this.loading) {
      return;
    }

    this.loading = true;

    try {
      await this.authService.register(this.name, this.email, this.password);
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
