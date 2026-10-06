// Gives packages the same `className` typings the apps get from their generated uniwind-types.d.ts.
/// <reference types="uniwind/types" />

declare module 'uniwind' {
  export interface UniwindConfig {
    themes: readonly ['light', 'dark'];
  }
}

export {};
