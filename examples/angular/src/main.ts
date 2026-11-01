import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { CustomUIExample } from './app/custom-ui.component';

bootstrapApplication(location.pathname === '/custom-ui' ? CustomUIExample : App, appConfig)
  .catch((err) => console.error(err));
