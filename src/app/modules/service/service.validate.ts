import { z } from 'zod';
import { CouponType } from './service.interface';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid ObjectId');

const couponSchema = z.object({
  coupon_code: z.string().min(3).max(40).optional(),
  qr_code: z.string().min(5).max(500).optional(), // recommend URL payload
  upc_code: z
    .string()
    .min(8)
    .max(14)
    .regex(/^\d+$/, 'UPC must be digits')
    .optional(),
});

// CREATE ZOD SCHEMA
export const CreateServiceZodSchema = z
  .object({
    shop: objectId,
    category: objectId,

    title: z.string().min(2).max(120).trim(),
    reguler_price: z.number().nonnegative(),
    discount: z.number().min(0).max(100).default(0), // percent

    highlight: z.array(z.string().min(1).max(120)).max(20).default([]),
    description: z.string().min(10).max(5000).trim(),

    couponType: z.nativeEnum(CouponType),
    coupon: couponSchema.default({}),

    total_views: z.number().int().nonnegative().optional(),
    total_impression: z.number().int().nonnegative().optional(),
  })
  .superRefine((val, ctx) => {
    // Coupon rules based on couponType
    if (val.couponType === CouponType.COUPON_CODE && !val.coupon?.coupon_code) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['coupon', 'coupon_code'],
        message: 'coupon_code is required when couponType is COUPON_CODE',
      });
    }

    if (val.couponType === CouponType.QR_CODE && !val.coupon?.coupon_code) {
      // If you plan to system-generate QR, then remove this requirement
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['coupon', 'qr_code'],
        message: 'qr_code is required when couponType is QR_CODE',
      });
    }

    if (val.couponType === CouponType.UPC_CODE && !val.coupon?.upc_code) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['coupon', 'upc_code'],
        message: 'upc_code is required when couponType is UPC_CODE',
      });
    }

    if (val.couponType === CouponType.NONE) {
      // Ensure coupon object is empty-ish
      const hasAny =
        !!val.coupon?.coupon_code ||
        !!val.coupon?.qr_code ||
        !!val.coupon?.upc_code;
      if (hasAny) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['coupon'],
          message: 'coupon must be empty when couponType is NONE',
        });
      }
    }
  });

// UPDATE ZOD SCHEMA
export const UpdateServiceZodSchema = z.object({
  title: z.string().min(2).max(120).trim().optional(),
  reguler_price: z.number().nonnegative().optional(),
  discount: z.number().min(0).max(100).optional(),
  highlight: z.array(z.string().min(1).max(120)).max(20).optional(),
  deletedHighlights: z.array(z.string().min(1).max(120)).max(20).optional(),
  description: z.string().min(10).max(5000).trim().optional(),
  deletedImages: z.array(z.string().url()).optional(), // Images should be an array of valid URLs
  couponType: z.nativeEnum(CouponType).optional(),
  coupon: z
    .object({
      coupon_code: z.string().min(3).max(40).optional(),
      qr_code: z.string().min(5).max(500).optional(),
      upc_code: z
        .string()
        .min(8)
        .max(14)
        .regex(/^\d+$/, 'UPC must be digits')
        .optional(),
    })
    .optional(),
});
