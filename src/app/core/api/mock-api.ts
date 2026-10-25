import { HttpInterceptorFn } from '@angular/common/http';
import { Provider } from '@angular/core';

/**
 * Interceptors of the mock API - none in a real build. The `mock` build configuration
 * (`angular.json`, `fileReplacements`) swaps this file for `src/mocks/mock-api.ts`, which is the
 * only way mock code gets into a bundle; `npm run check:bundle` proves the production one has none.
 */
export const mockApiInterceptors: readonly HttpInterceptorFn[] = [];

/**
 * Providers of the mock build - none in a real build: the same door, for what the mock build fakes
 * outside HTTP (the Web Push of the browser, HAS-284).
 */
export const mockApiProviders: readonly Provider[] = [];
