/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "1" = public distribution build: ships no third-party data, crests or photos. */
  readonly VITE_PUBLIC_BUILD?: string;
}
