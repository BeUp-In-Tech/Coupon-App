import z from 'zod';
import { ShopApproval } from './shop.interface';

const businessPhoneSchema = z.object({
  country_code: z
    .string()
    .min(1, "Country code is required")
    .regex(/^\+?[1-9]\d{1,14}$/, "Invalid country code format"),  // Regex for valid country code (international)
  
  phone_number: z
    .string()
    .min(1, "Phone number is required")
    .regex(/^\d{10,15}$/, "Phone number must be between 10 and 15 digits"),  // Regex for valid phone number (simplified)
});


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

    business_phone: businessPhoneSchema,

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

  zip_code: z.string().min(3).max(15).optional(),
  website: z.string().url('Invalid website URL').optional(),
});
