import z from 'zod';

export const outletCreateZodSchema = z.object({
  outlet: z
    .array(
      z.object({
        outlet_name: z.string({
          message: 'Location name must be string',
        }),

        address: z.string({
          message: 'Address must be string',
        }),

        zip_code: z.string({
          message: 'Zip code must be string',
        }),

        coordinates: z.tuple([
          z.number().min(-180).max(180), // longitude
          z.number().min(-90).max(90), // latitude
        ]),
      })
    )
    .min(1, 'At least one outlet is required'),
});

export const outletUpdateZodSchema = z.object({
  outlet_name: z
    .string({
      message: 'Outlet name must be string',
    })
    .optional(),

  address: z
    .string({
      message: 'Address must be string',
    })
    .optional(),

  zip_code: z
    .string({
      message: 'Zip code must be string',
    })
    .optional(),

  coordinates: z
    .tuple([
      z.number().min(-180).max(180), // longitude
      z.number().min(-90).max(90), // latitude
    ])
    .optional(),
});
