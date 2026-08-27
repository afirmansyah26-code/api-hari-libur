import { z } from 'zod';
import { getJakartaDate } from '../utils/timezone';

export const dateSchema = z
  .object({
    year: z.coerce
      .number()
      .min(2011, {
        message: 'Minimum year is 2011',
      })
      .refine(
        (y) => {
          const maxYear = getJakartaDate().year + 1;
          return y <= maxYear;
        },
        () => ({
          message: `Maximum year is ${getJakartaDate().year + 1}`,
        })
      )
      .optional(),
    month: z.coerce
      .number()
      .min(1, {
        message: 'Minimum month is 1',
      })
      .max(12, {
        message: 'Maximum month is 12',
      })
      .optional(),
    day: z.coerce
      .number()
      .min(1, {
        message: 'Minimum day is 1',
      })
      .max(31, {
        message: 'Maximum day is 31',
      })
      .optional(),
  })
  .superRefine(({ year, month, day }, ctx) => {
    const targetYear = year ?? getJakartaDate().year;

    if (day) {
      if (!month) {
        ctx.addIssue({
          path: ['month'],
          code: 'custom',
          message: 'Month is required when specifying day',
        });

        return z.NEVER;
      }

      const parsedDate = new Date(targetYear, month - 1, day);

      if (
        parsedDate.getFullYear() !== targetYear ||
        parsedDate.getMonth() !== month - 1 ||
        parsedDate.getDate() !== day
      ) {
        ctx.addIssue({
          path: ['day'],
          code: 'custom',
          message: 'The provided date is not valid',
        });
      }
    }
  });
