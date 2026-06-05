import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideNotectl } from '@notectl/angular';

export const appConfig: ApplicationConfig = {
  providers: [
    // Zoneless is the Angular v21+ default; declared explicitly to make the
    // intent visible and future-proof.
    provideZonelessChangeDetection(),
    provideBrowserGlobalErrorListeners(),
    provideNotectl(),
  ],
};
