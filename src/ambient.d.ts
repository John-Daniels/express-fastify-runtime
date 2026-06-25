/**
 * Ambient declarations for CJS packages without @types.
 * Express 5.2.1 uses the same packages (see docs/EXPRESS_REFERENCE.md).
 */
declare module 'accepts' {
  import type { IncomingMessage } from 'node:http';
  function accepts(req: IncomingMessage & { headers: Record<string, string | string[] | undefined> }): {
    types: (...types: string[]) => string | false | string[];
    encodings: (...encodings: string[]) => string | false | string[];
    charsets: (...charsets: string[]) => string | false | string[];
    languages: (...langs: string[]) => string | false | string[];
  };
  export = accepts;
}

declare module 'type-is' {
  import type { IncomingMessage } from 'node:http';
  function typeis(
    req: IncomingMessage & { headers: Record<string, string | string[] | undefined> },
    types: string[]
  ): string | false;
  export = typeis;
}

declare module 'encodeurl' {
  function encodeUrl(url: string): string;
  export = encodeUrl;
}
