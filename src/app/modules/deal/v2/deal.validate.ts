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

  if (type === DealDiscountType.NO_DISCOUNT) {
    if (discount !== undefined && discount !== 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'Discount must be 0 when no discount is selected',
        path: ['discount'],
      });
    }
  }

  // FIXED_PRICE has no percentage discount — the discount field is irrelevant.
  // The backend normalises it to 0 automatically, so this is just a guard
  // against a client that accidentally sends a non-zero value.
  if (type === DealDiscountType.FIXED_PRICE) {
    if (discount !== undefined && discount !== 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'Discount must be 0 for a fixed-price deal — the price itself is the offer',
        path: ['discount'],
      });
    }
  }

  if (type === DealDiscountType.FREE) {
    if (payload.regular_price !== undefined && payload.regular_price !== 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'Regular price and discount must both be 0 for a free deal',
        path: ['regular_price'],
      });
    }

    if (discount !== undefined && discount !== 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'Regular price and discount must both be 0 for a free deal',
        path: ['discount'],
      });
    }
  }

  if (type === DealDiscountType.PERCENT_OFF_TOTAL) {
    if (payload.regular_price !== undefined && payload.regular_price !== 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'Regular price is not required for percentage-off-total deals',
        path: ['regular_price'],
      });
    }
  }

  // Types that need a regular price must have it present and > 0
  const requiresRegularPrice =
    type === DealDiscountType.PERCENT_OFF_PRICE ||
    type === DealDiscountType.FIXED_PRICE ||
    type === DealDiscountType.NO_DISCOUNT ||
    type === DealDiscountType.CUSTOM_DISCOUNT;
  if (requiresRegularPrice && (payload.regular_price === undefined || payload.regular_price < 0)) {
    ctx.addIssue({
      code: 'custom',
      message: 'regular_price is required for this discount type',
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

  // NO_PRICE: vendor posts a deal with no price information at all.
  // Both regular_price and discount must be absent or 0.
  if (type === DealDiscountType.NO_PRICE) {
    if (payload.regular_price !== undefined && payload.regular_price !== 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'regular_price must be 0 or omitted for a no-price deal',
        path: ['regular_price'],
      });
    }
    if (payload.discount !== undefined && payload.discount !== 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'discount must be 0 or omitted for a no-price deal',
        path: ['discount'],
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
    regular_price: z.number().nonnegative().optional(),
    discount: z.number().nonnegative().optional(),
    discount_type: discountTypeSchema.default(
      DealDiscountType.PERCENT_OFF_PRICE
    ),
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
  })
  .transform((data) => ({
    ...data,
    // Normalise discount to 0 for types where it is irrelevant.
    // Frontend can omit the field for FIXED_PRICE, NO_DISCOUNT, FREE, NO_PRICE.
    discount: (
      data.discount_type === DealDiscountType.FIXED_PRICE ||
      data.discount_type === DealDiscountType.NO_DISCOUNT ||
      data.discount_type === DealDiscountType.FREE ||
      data.discount_type === DealDiscountType.NO_PRICE
    ) ? 0 : (data.discount ?? 0),
    // NO_PRICE: no price information — normalise regular_price to 0.
    regular_price: (
      data.discount_type === DealDiscountType.NO_PRICE
    ) ? 0 : (data.regular_price ?? 0),
  }));

export const UpdateDealV2ZodSchema = z
  .object({
    title: z.string().trim().min(2).max(120).optional(),
    regular_price: z.number().nonnegative().optional(),
    discount: z.number().nonnegative().optional(),
    discount_type: discountTypeSchema.optional(),
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
  })
  .superRefine((payload, ctx) => {
    validatePricingAndRedemption(payload, ctx);
  })
  .transform((data) => ({
    ...data,
    // Normalise discount/price to 0 for types where they are irrelevant.
    discount: (
      data.discount_type === DealDiscountType.FIXED_PRICE ||
      data.discount_type === DealDiscountType.NO_DISCOUNT ||
      data.discount_type === DealDiscountType.FREE ||
      data.discount_type === DealDiscountType.NO_PRICE
    ) ? 0 : data.discount,
    regular_price: (
      data.discount_type === DealDiscountType.NO_PRICE
    ) ? 0 : data.regular_price,
  }));

export { validatePricingAndRedemption };
