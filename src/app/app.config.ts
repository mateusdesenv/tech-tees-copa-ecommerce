import { ApplicationConfig } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { getAuth, provideAuth } from '@angular/fire/auth';
import { environment } from '../environments/environment';
import { routes } from './app.routes';

const firebaseConfigured = Boolean(
  environment.firebase.apiKey &&
  environment.firebase.authDomain &&
  environment.firebase.projectId &&
  environment.firebase.appId,
);

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(),
    provideRouter(routes),
    ...(firebaseConfigured
      ? [
          provideFirebaseApp(() => initializeApp(environment.firebase)),
          provideAuth(() => getAuth()),
        ]
      : []),
  ],
};
