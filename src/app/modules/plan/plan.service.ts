/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { JwtPayload } from "jsonwebtoken";
import { IPlan } from "./plan.interface";
import { Role } from "../user/user.interface";
import AppError from "../../errorHelpers/AppError";
import { StatusCodes } from "http-status-codes";
import { Plan } from "./plan.model";
import { deleteImageFromCLoudinary } from "../../config/cloudinary.config";


const createPlanService = async (authUser: JwtPayload, payload: IPlan) => {

    // ENSURE USER IS ADMIN
    if (authUser.role !== Role.ADMIN) {
        // Delete image if error occured
        if (payload.icon) {
            try {
                await Promise.resolve(deleteImageFromCLoudinary(payload.icon));
            } catch (error: any) {
                console.log("Cloudinary image delete error: ", error.message);
            }
        }

        // Throw Error
        throw new AppError(StatusCodes.UNAUTHORIZED, "Your are unauthorized");
    }

    // ENSURE PRICE IS NOT NEGATIVE OR DECIMAL
    if (payload.price < 0 || !Number.isInteger(payload.price)) {
        // Delete image if error occured
        if (payload.icon) {
            try {
                await Promise.resolve(deleteImageFromCLoudinary(payload.icon));
            } catch (error: any) {
                console.log("Cloudinary image delete error: ", error.message);
            }
        }

        // Throw Error
        throw new AppError(StatusCodes.BAD_REQUEST, "Price shouldn't be negative or decimal");
    }


    // ENSURE DAYS IS NOT NEGATIVE OR DECIMAL
    if (payload.durationDays < 0 || !Number.isInteger(payload.durationDays)) {
        // Delete image if error Role is not ADMIN
        if (payload.icon) {
            try {
                await Promise.resolve(deleteImageFromCLoudinary(payload.icon));
            } catch (error: any) {
                console.log("Cloudinary image delete error: ", error.message);
            }
        }

        // Throw Error
        throw new AppError(StatusCodes.BAD_REQUEST, "Days shouldn't be negative or decimal");
    }

    // CREATE PLAN
    const plan = await Plan.create(payload);
    return plan;
} 



export const planServices = {
    createPlanService
}