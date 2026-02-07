/**
 * Real Express app instance. Not a reimplementation.
 */

import express from 'express';

export function createExpressEngine(): express.Application {
  return express();
}
