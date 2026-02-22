import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideNotectl } from '@notectl/angular';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideNotectl(),
  ],
};
