import { z } from 'zod';


const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid ObjectId');

// CREATE ZOD SCHEMA
export const CreateDealZodSchema = z
  .object({
    shop: objectId,
    category: objectId,

    title: z.string().min(2).max(120).trim(),
    reguler_price: z.number().nonnegative(),
    discount: z.number().min(0).max(100).default(0), // percent

    highlight: z.array(z.string().min(1).max(120)).max(20).default([]),
    description: z.string("Description must be string").min(10).max(5000).trim(),
 
    coupon: z.string("Coupon must be string"),

    total_views: z.number().int().nonnegative().optional(),
    total_impression: z.number().int().nonnegative().optional(),
  });

// UPDATE ZOD SCHEMA
export const UpdateDealZodSchema = z.object({
  title: z.string("Title must be string").min(2).max(120).trim().optional(),
  reguler_price: z.number("Reguler price must be number").nonnegative().optional(),
  discount: z.number("Discount must be number").min(0).max(100).optional(),
  highlight: z.array(z.string("Highlight must be string").min(1).max(120)).max(20).optional(),
  deletedHighlights: z.array(z.string().min(1).max(120)).max(20).optional(),
  description: z.string().min(10).max(5000).trim().optional(),
  deletedImages: z.array(z.string().url()).optional(), // Images should be an array of valid URLs
  coupon: z
    .string("Coupon must be string")
    .optional(),
});
