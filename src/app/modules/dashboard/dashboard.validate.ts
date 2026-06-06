import z from "zod";


export const adminNotificationAndEmailZodSchema = z.object({
    title: z.string( 'Title is required'),
    message: z.string('Message is required'),
    channel: z.object({
        push: z.boolean("Channel filed must be boolean").optional(),
        email: z.boolean("Channel field must be boolean").optional()
    }),
    to: z.object({
        all_users: z.boolean("All vendors field must be boolean").optional(),
        active_vendors: z.boolean("Active vendors field must be boolean").optional(),
    })
})

export const adminBanDealZodSchema = z.object({
    reason: z
        .string("Ban reason is required")
        .trim()
        .min(1, "Ban reason is required")
        .max(500, "Ban reason must be maximum 500 characters"),
});
