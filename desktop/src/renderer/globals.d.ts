import type { DesktopApi } from '../shared/settings';

declare global {
  interface Window {
    powershellConfig: DesktopApi;
  }
}

export {};
