import z from "zod";
import { Role } from "./user.interface";

 

 export const vendorZodSchema = z.object({
    user_name: z
            .string({error: "Name must be string type!"})
            .min(3, "Name must be at least minimum 3 characters!")
            .max(100, "Name must be maximum 100 characters! "),
    email: z
            .string().email(),
    password: z
                .string({error: "Password shuld be string type!"})
                .min(6, "Password length shuld be at least 6!")
                .regex(/^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{6,}$/, {
                    message: "Password must be at least 1 uppercase character, 1 special charater, 1 number!"
                })
                .optional()
 });


 export const vendorUpdateZodSchema = z.object({
    user_name: z
            .string({error: "Name must be string type!"})
            .min(3, "Name must be at least minimum 3 characters!")
            .max(100, "Name must be maximum 100 characters! ")
            .optional(),
    isVerified: z
                .boolean({error: "Only boolean acceptable"})
                .optional(),
    role: z
            .enum(Object.values(Role))
            .optional()
 });