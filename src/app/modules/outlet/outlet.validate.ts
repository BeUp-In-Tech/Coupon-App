import z from "zod";


export const outletUpdateZodSchema = z.object({ 
      address: z.string({
        message: "Address must be string",
      }).optional(),

      zip_code: z.string({
        message: "Zip code must be string",
      }).optional(),

      coordinates: z.tuple([
        z.number().min(-180).max(180), // longitude
        z.number().min(-90).max(90), // latitude
      ]).optional(),
})
