import z from 'zod';

// Create schema for a single location
export const locationCreateZodSchema = z.object({
  location_name: z
    .string({
      message: 'Location name must be string',
    })
    .min(1, 'Location name is required'),

  address: z.object({
    street: z.string({
      message: 'Street must be string',
    }),

    zip_code: z.string({
      message: 'Zip code must be string',
    }),

    city: z.string({
      message: 'City must be string',
    }),

    state: z.string({
      message: 'State must be string',
    }),

    country: z.string({
      message: 'Country must be string',
    }),
  }),

  coordinates: z.tuple([
    z.number().min(-180).max(180), // longitude
    z.number().min(-90).max(90), // latitude
  ]),

  isActive: z
    .boolean({
      message: 'isActive must be boolean',
    })
    .optional()
    .default(true),
});

// Update schema for location - allows partial address updates
export const locationUpdateZodSchema = z.object({
  location_name: z
    .string({
      message: 'Location name must be string',
    })
    .min(1)
    .optional(),

  address: z
    .object(
      {
        street: z.string({
          message: 'Street must be string',
        }),

        zip_code: z.string({
          message: 'Zip code must be string',
        }),

        city: z.string({
          message: 'City must be string',
        }),

        state: z.string({
          message: 'State must be string',
        }),

        country: z.string({
          message: 'Country must be string',
        }),
      },
      { message: 'Address must be an object' }
    )
    .partial() // Allow partial address updates
    .optional(),

  coordinates: z
    .tuple([
      z.number().min(-180).max(180), // longitude
      z.number().min(-90).max(90), // latitude
    ])
    .optional(),

  isActive: z
    .boolean({
      message: 'isActive must be boolean',
    })
    .optional(),
});
