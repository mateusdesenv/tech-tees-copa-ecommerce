import { Injectable, inject } from '@angular/core';
import {
  Auth,
  GoogleAuthProvider,
  User,
  UserCredential,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from '@angular/fire/auth';
import { Observable, ReplaySubject, firstValueFrom, map, take } from 'rxjs';
import { environment } from '../environments/environment';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly userSubject = new ReplaySubject<User | null>(1);
  private readonly auth = inject(Auth, { optional: true });

  readonly user$: Observable<User | null> = this.userSubject.asObservable();
  readonly isAuthenticated$ = this.user$.pipe(map((user) => Boolean(user)));
  readonly isConfigured: boolean;

  constructor() {
    this.isConfigured = Boolean(this.auth && this.hasFirebaseConfig());

    if (!this.auth || !this.isConfigured) {
      this.userSubject.next(null);
      return;
    }

    onAuthStateChanged(this.auth, (user) => this.userSubject.next(user));
  }

  get currentUser(): User | null {
    return this.auth?.currentUser ?? null;
  }

  waitForAuthState(): Promise<User | null> {
    return firstValueFrom(this.user$.pipe(take(1)));
  }

  async login(email: string, password: string): Promise<UserCredential> {
    const credential = await signInWithEmailAndPassword(
      this.requireAuth(),
      email.trim(),
      password,
    );
    this.userSubject.next(credential.user);
    return credential;
  }

  async register(name: string, email: string, password: string): Promise<UserCredential> {
    const credential = await createUserWithEmailAndPassword(
      this.requireAuth(),
      email.trim(),
      password,
    );

    if (name.trim()) {
      await updateProfile(credential.user, { displayName: name.trim() });
      await credential.user.reload();
    }

    this.userSubject.next(credential.user);
    return credential;
  }

  async loginWithGoogle(): Promise<UserCredential> {
    const credential = await signInWithPopup(
      this.requireAuth(),
      new GoogleAuthProvider(),
    );
    this.userSubject.next(credential.user);
    return credential;
  }

  async logout(): Promise<void> {
    await signOut(this.requireAuth());
    this.userSubject.next(null);
  }

  authErrorMessage(error: unknown): string {
    const code = this.errorCode(error);
    const messages: Record<string, string> = {
      'auth/email-already-in-use': 'Este e-mail já está cadastrado.',
      'auth/invalid-credential': 'E-mail ou senha inválidos.',
      'auth/invalid-email': 'Informe um e-mail válido.',
      'auth/missing-password': 'Informe sua senha.',
      'auth/popup-closed-by-user': 'O login com Google foi cancelado.',
      'auth/popup-blocked': 'O navegador bloqueou a janela de login do Google.',
      'auth/too-many-requests': 'Muitas tentativas. Aguarde um pouco e tente novamente.',
      'auth/user-disabled': 'Esta conta foi desativada.',
      'auth/weak-password': 'A senha deve ter pelo menos 6 caracteres.',
    };

    return messages[code] || 'Não foi possível autenticar. Tente novamente.';
  }

  private requireAuth(): Auth {
    if (!this.auth) {
      throw new Error('firebase-not-configured');
    }

    return this.auth;
  }

  private hasFirebaseConfig(): boolean {
    const config = environment.firebase;
    return Boolean(
      config.apiKey &&
      config.authDomain &&
      config.projectId &&
      config.appId,
    );
  }

  private errorCode(error: unknown): string {
    if (error instanceof Error && error.message === 'firebase-not-configured') {
      return 'firebase-not-configured';
    }

    if (typeof error === 'object' && error && 'code' in error) {
      return String(error.code);
    }

    return '';
  }
}
