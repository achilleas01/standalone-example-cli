import {
  platformBrowser,
  BrowserModule,
  bootstrapApplication,
} from '@angular/platform-browser';
import { importProvidersFrom } from '@angular/core';
import { AppComponent } from './app/app.component';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatButtonModule } from '@angular/material/button';
import { MatToolbarModule } from '@angular/material/toolbar';
import {
  provideStoreDevtools,
  StoreDevtoolsModule,
} from '@ngrx/store-devtools';
import { EffectsModule, provideEffects } from '@ngrx/effects';
import { reducer } from './app/+state';
import { provideStore, StoreModule } from '@ngrx/store';
import { DefaultLogAppender } from './app/shared/logger/log-appender';
import { LogLevel } from './app/shared/logger/log-level';
import { LoggerModule } from './app/shared/logger/logger-module';
import { LayoutModule } from '@angular/cdk/layout';
import { APP_ROUTES } from './app/app.routes';
import {
  withPreloading,
  provideRouter,
  PreloadAllModules,
} from '@angular/router';
import { provideAnimations } from '@angular/platform-browser/animations';
import { LegacyInterceptor } from './app/shared/legacy.interceptor';
import {
  HTTP_INTERCEPTORS,
  withInterceptorsFromDi,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { provideLogger } from './app/shared/logger/providers';
import { authInterceptor } from './app/shared/auth.interceptor';

bootstrapApplication(AppComponent, {
  providers: [

    provideLogger({
      level: LogLevel.DEBUG,
      appenders: [DefaultLogAppender],
      formatter: (level, cat, msg) => [level, cat, msg].join(';'),
    }),

    provideStore(reducer),
    provideEffects(),
    provideStoreDevtools(),

    provideAnimations(),

    provideHttpClient(withInterceptors([authInterceptor])),
    provideRouter(APP_ROUTES, withPreloading(PreloadAllModules)),

    importProvidersFrom(
      LayoutModule,
      MatToolbarModule,
      MatButtonModule,
      MatSidenavModule,
      MatIconModule,
      MatListModule
    ),
    
  ],
});
