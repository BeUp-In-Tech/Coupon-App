import z from 'zod';
import { ShopApproval } from './shop.interface';


export const shopValidationSchema = z.object({

  shop: z.object({
    business_name: z
      .string()
      .min(2, "Business name is required")
      .max(120),

    business_email: z
      .string()
      .email("Invalid business email")
      .toLowerCase(),

    description: z
      .string()
      .min(10, "Description too short")
      .max(1000),

    zip_code: z.string().min(3).max(15),

    website: z
      .string()
      .url("Invalid website URL")
      .optional(),
  }),

  outlet: z.array(
    z.object({

      address: z.string({
        message: "Address must be string",
      }),

      zip_code: z.string({
        message: "Zip code must be string",
      }),

      coordinates: z.tuple([
        z.number().min(-180).max(180), // longitude
        z.number().min(-90).max(90), // latitude
      ]),
    })
  )

});

export const updateShopValidationSchema = z.object({
  business_name: z
    .string()
    .min(2, 'Business name is required')
    .max(120)
    .optional(),

  description: z.string().min(10, 'Description too short').max(1000).optional(),
  shop_approval: z.nativeEnum(ShopApproval).optional(),

  coord: z
    .tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)])
    .optional(),

  zip_code: z.string().min(3).max(15).optional(),
  website: z.string().url('Invalid website URL').optional(),
});
