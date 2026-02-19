import z from 'zod';

export const shopValidationSchema = z.object({
    business_name: z.string().min(2, 'Business name is required').max(120),
    business_email: z.string().email('Invalid business email').toLowerCase(),
    business_logo: z.string().url('Business logo must be a valid URL'),
    description: z.string().min(10, 'Description too short').max(1000),
    coord: z.tuple([
      z.number().min(-180).max(180), // longitude
      z.number().min(-90).max(90), // latitude
    ]),
    zip_code: z.string().min(3).max(15),
    website: z.string().url('Invalid website URL').optional(),
});
