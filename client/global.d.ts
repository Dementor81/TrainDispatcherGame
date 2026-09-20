declare const __APP_VERSION__: string;

interface ImportMeta {
  webpackContext: (
    request: string,
    options?: {
      recursive?: boolean;
      regExp?: RegExp;
    }
  ) => {
    keys(): string[];
    (id: string): string;
  };
}
