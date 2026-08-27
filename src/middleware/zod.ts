import type { ValidationTargets } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { zValidator as zv } from '@hono/zod-validator';
import type { ZodSchema } from 'zod';

/**
 * Custom Zod validator middleware for Hono that formats validation errors into HTTP 422 Unprocessable Entity.
 */
export const zValidator = <
  T extends ZodSchema,
  Target extends keyof ValidationTargets
>(
  target: Target,
  schema: T
) =>
  zv(target, schema, (result) => {
    if (!result.success) {
      throw new HTTPException(422, {
        message: 'The given data was invalid.',
        cause: result.error.flatten().fieldErrors,
      });
    }
  });
