import { z } from 'zod';
import { DealDiscountType } from '../v1/deal.constant';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid ObjectId');
const discountTypeSchema = z.nativeEnum(DealDiscountType);
const couponOptionSchema = z
  .object({
    qr: z.string().url('QR must be a valid URL').optional(),
    upc: z.string().url('UPC must be a valid URL').optional(),
  })
  .optional();

const validatePricingAndRedemption = (
  payload: {
    regular_price?: number;
    discount?: number;
    discount_type?: DealDiscountType;
    minimum_purchase?: number;
    custom_discount?: string;
    coupon_required?: boolean;
    coupon?: string;
    coupon_option?: { qr?: string; upc?: string };
  },
  ctx: z.RefinementCtx
) => {
  const type = payload.discount_type;
  const discount = payload.discount;

  if (
    (type === DealDiscountType.PERCENT_OFF_PRICE ||
      type === DealDiscountType.PERCENT_OFF_TOTAL) &&
    (discount === undefined || discount < 1 || discount > 100)
  ) {
    ctx.addIssue({
      code: 'custom',
      message: 'Percentage discount must be between 1 and 100',
      path: ['discount'],
    });
  }

  if (type === DealDiscountType.AMOUNT_OFF_PURCHASE) {
    if (discount === undefined || discount <= 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'Discount amount must be greater than 0',
        path: ['discount'],
      });
    }

    if (
      payload.minimum_purchase === undefined ||
      payload.minimum_purchase <= 0
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'Minimum purchase is required and must be greater than 0',
        path: ['minimum_purchase'],
      });
    } else if (
      discount !== undefined &&
      payload.minimum_purchase < discount
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'Minimum purchase cannot be less than the discount amount',
        path: ['minimum_purchase'],
      });
    }
  }

  if (
    type === DealDiscountType.NO_DISCOUNT &&
    discount !== 0
  ) {
    ctx.addIssue({
      code: 'custom',
      message: 'Discount must be 0 when no discount is selected',
      path: ['discount'],
    });
  }

  if (
    type === DealDiscountType.FREE &&
    (payload.regular_price !== 0 || discount !== 0)
  ) {
    ctx.addIssue({
      code: 'custom',
      message: 'Regular price and discount must both be 0 for a free deal',
      path: ['regular_price'],
    });
  }

  if (type === DealDiscountType.CUSTOM_DISCOUNT) {
    if (!payload.custom_discount || !payload.custom_discount.trim()) {
      ctx.addIssue({
        code: 'custom',
        message: 'custom_discount is required for custom discount deals',
        path: ['custom_discount'],
      });
    }
  }

  if (
    payload.coupon_required &&
    !payload.coupon &&
    !payload.coupon_option?.qr &&
    !payload.coupon_option?.upc
  ) {
    ctx.addIssue({
      code: 'custom',
      message: 'At least one coupon code, QR, or UPC is required',
      path: ['coupon_required'],
    });
  }

  if (
    payload.coupon_required === false &&
    (payload.coupon ||
      payload.coupon_option?.qr ||
      payload.coupon_option?.upc)
  ) {
    ctx.addIssue({
      code: 'custom',
      message: 'Coupon values are not allowed when coupon is not required',
      path: ['coupon_required'],
    });
  }
};

export const CreateDealV2ZodSchema = z
  .object({
    category: objectId,
    title: z.string().trim().min(5).max(120),
    regular_price: z.number().nonnegative(),
    discount: z.number().nonnegative(),
    discount_type: discountTypeSchema.default(
      DealDiscountType.PERCENT_OFF_PRICE
    ),
    minimum_purchase: z.number().positive().optional(),
    custom_discount: z.string("Custom discount must be string").optional(),
    highlight: z.array(z.string().min(1).max(120)).max(20).default([]),
    tags: z.array(z.string().min(1).max(50)).max(20).default([]),
    description: z.string().trim().min(10).max(5000),
    images: z.array(z.string().url()).min(1),
    coupon: z.string().trim().min(1).optional(),
    coupon_required: z.boolean().default(true),
    coupon_option: couponOptionSchema,
    nationwide: z.boolean().default(false),
    available_in_location: z.array(objectId).default([]),
  })
  .superRefine((payload, ctx) => {
    validatePricingAndRedemption(payload, ctx);

    if (!payload.nationwide && payload.available_in_location.length === 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'At least one location is required when nationwide is false',
        path: ['available_in_location'],
      });
    }
  });

export const UpdateDealV2ZodSchema = z.object({
  title: z.string().trim().min(2).max(120).optional(),
  regular_price: z.number().nonnegative().optional(),
  discount: z.number().nonnegative().optional(),
  discount_type: discountTypeSchema.optional(),
  minimum_purchase: z.number().positive().optional(),
  custom_discount: z.string("Custom discount must be string").optional(),
  highlight: z.array(z.string().min(1).max(120)).max(20).optional(),
  deletedHighlights: z.array(z.string().min(1).max(120)).max(20).optional(),
  tags: z.array(z.string().min(1).max(50)).max(20).optional(),
  deletedTags: z.array(z.string().min(1).max(120)).max(20).optional(),
  images: z.array(z.string().url()).optional(),
  deletedImages: z.array(z.string().url()).optional(),
  description: z.string().trim().min(10).max(5000).optional(),
  coupon: z.string().trim().min(1).optional(),
  coupon_required: z.boolean().optional(),
  coupon_option: couponOptionSchema,
  nationwide: z.boolean().optional(),
  available_in_location: z.array(objectId).optional(),
});

export { validatePricingAndRedemption };
