import { z } from 'zod';


const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid ObjectId');

// CREATE ZOD SCHEMA
export const CreateDealZodSchema = z
  .object({
    category: objectId,

    title: z.string().min(5, "Title must be minimum 5 characters").max(120, "Title must be maximum 120 characters").trim(),
    regular_price: z.number("Price must be number").nonnegative("Regular price shouldn't be negative number"),
    discount: z.number("Discount must be number").min(0, "Minimum discount should be 0").max(100, "Maximum discount should be 100%").default(0), // percent

    highlight: z.array(z.string("Highlight should be string").min(1, "Highlight should be minimum 1 character").max(120, "Maximum highlight length should be 120 characters")).max(20).default([]),
    tags: z.array(z.string().min(1, "Minimum 1 tags required").max(50, "Maximum 50 tags allowed")).default([]),
    description: z.string("Description must be string").min(10, "Description must be minimum 10 characters").max(5000, "Max description length should be 5000 characters").trim(),
    images: z.array(z.string().url()),
    coupon: z.string("Coupon must be string").optional(),
    available_in_location: z.array(z.string()),

    coupon_option: z.object({
      qr: z.string().url().optional(),
      upc: z.string().url().optional(),
    }).optional()
  });

// UPDATE ZOD SCHEMA
export const UpdateDealZodSchema = z.object({
  title: z.string("Title must be string").min(2, "Title must be minimum 2 characters").max(120, "Title must be maximum 120 characters").trim().optional(),
  regular_price: z.number("Reguler price must be number").nonnegative("Regular price shouldn't be negative number").optional(),
  discount: z.number("Discount must be number").min(0, "Minimum discount should be 0").max(100, "Maximum discount should be 100%").optional(),
  highlight: z.array(z.string("Highlight must be string").min(1, "Highlight should be minimum 1 character").max(120, "Maximum highlight length should be 120 characters")).max(20, "Maximum 20 highlights allowed").optional(),
  deletedHighlights: z.array(z.string("Deleted highlight must be string").min(1, "Deleted highlight should be minimum 1 character").max(120, "Maximum deleted highlight length should be 120 characters")).max(20, "Maximum 20 deleted highlights allowed").optional(),
  tags: z.array(z.string("Tag must be string").min(1, "Minimum 1 tags required").max(50, "Maximum 50 tags allowed")).max(20, "Maximum 20 tags allowed").default([]).optional(),
  deletedTags: z.array(z.string("Deleted tag must be string").min(1, "Deleted tag should be minimum 1 character").max(120, "Maximum deleted tag length should be 120 characters")).max(20, "Maximum 20 deleted tags allowed").optional(),
  images: z.array(z.string("Image must be string").url("Image must be a valid URL")).optional(),
  description: z.string("Description must be string").min(10, "Description must be minimum 10 characters").max(5000, "Max description length should be 5000 characters").trim().optional(),
  deletedImages: z.array(z.string("Deleted image must be string").url("Deleted image must be a valid URL")).optional(), // Images should be an array of valid URLs
  coupon: z
    .string("Coupon must be string")
    .optional(),
  coupon_option: z.object({
      qr: z.string("QR must be string").url("QR must be a valid URL").optional(),
      upc: z.string("UPC must be string").url("UPC must be a valid URL").optional(),
    }).optional()
});
