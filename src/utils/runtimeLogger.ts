/**
 * Lightweight runtime logger for dev-only warnings when we fall back to Express lane.
 * No dependency on pino; uses console in development.
 */

const PREFIX = '[express-fastify-runtime]';
const FALLBACK_MSG =
  'is not supported fully yet, downgrading to express pattern (create an issue if this is something you would like express-runtime to support)';

export interface RuntimeLogger {
  /** Call when a feature is unsupported and we fall back to Express lane. */
  warnDowngrade(feature: string): void;
}

function isDev(dev?: boolean): boolean {
  if (typeof dev === 'boolean') return dev;
  return process.env.NODE_ENV !== 'production';
}

/**
 * Create a runtime logger. Only logs when dev is true or NODE_ENV !== 'production'.
 */
export function createRuntimeLogger(options?: { dev?: boolean }): RuntimeLogger {
  const active = isDev(options?.dev);
  return {
    warnDowngrade(feature: string) {
      if (active) {
        console.warn(`${PREFIX} ${feature} ${FALLBACK_MSG}`);
      }
    },
  };
}
