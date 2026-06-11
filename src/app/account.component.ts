import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { User } from '@angular/fire/auth';
import { AuthService } from './auth.service';

@Component({
  selector: 'app-account',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './account.component.html',
  styleUrl: './account.component.css',
})
export class AccountComponent {
  private readonly authService = inject(AuthService);
  readonly user$ = this.authService.user$;

  userInitials(user: User): string {
    const source = user.displayName || user.email || 'Tech Tees';
    return source
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase();
  }
}
