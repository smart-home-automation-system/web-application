import { HttpInterceptorFn } from '@angular/common/http';

/**
 * Interceptors of the mock API - none in a real build. The `mock` build configuration
 * (`angular.json`, `fileReplacements`) swaps this file for `src/mocks/mock-api.ts`, which is the
 * only way mock code gets into a bundle; `npm run check:bundle` proves the production one has none.
 */
export const mockApiInterceptors: readonly HttpInterceptorFn[] = [];
