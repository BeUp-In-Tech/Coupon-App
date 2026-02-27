import z from "zod";


export const planCreateZodSchema = z.object({
    title: z.string("Title must be string").min(5, "Title must be minimum 5 char").max(100, "Title must be max 100 char"),
    short_desc: z.string("Description must be string").min(10, "Minumum 10 char").max(100, "Maximum 100 char"),
    price: z.number("Price must be number").nonnegative("Price shouldn't be negative number"),
    currency: z.string("Currency must be string").optional(),
    durationDays: z.number("Days must be number").nonnegative("Days shouldn't be negative number")
})


export const planUpdateZodSchema = z.object({
    title: z.string("Title must be string").min(5, "Title must be minimum 5 char").max(100, "Title must be max 100 char").optional(),
    short_desc: z.string("Description must be string").min(10, "Minumum 10 char").max(100, "Maximum 100 char").optional(),
    price: z.number("Price must be number").nonnegative("Price shouldn't be negative number").optional(),
    currency: z.string("Currency must be string").optional(),
    durationDays: z.number("Days must be number").nonnegative("Days shouldn't be negative number").optional()
})