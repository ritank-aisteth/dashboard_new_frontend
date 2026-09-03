interface URLPatternOptions {
  ignoreCase?: boolean;
}

interface URLPatternInit {
  baseURL?: string;
  protocol?: string;
  username?: string;
  password?: string;
  hostname?: string;
  port?: string;
  pathname?: string;
  search?: string;
  hash?: string;
}

type URLPatternInput = string | URLPatternInit;

interface URLPattern {
  test(input?: URLPatternInput, baseURL?: string): boolean;
  exec(input?: URLPatternInput, baseURL?: string): object | null;
}

declare const URLPattern: {
  prototype: URLPattern;
  new(input?: URLPatternInput, baseURL?: string, options?: URLPatternOptions): URLPattern;
};
