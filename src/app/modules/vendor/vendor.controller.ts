/* eslint-disable @typescript-eslint/no-unused-vars */
import { NextFunction, Request, Response } from "express";
import { CatchAsync } from "../../utils/CatchAsync";
import { SendResponse } from "../../utils/SendResponse";
import { success } from "zod";
import { StatusCodes } from "http-status-codes";
import { vendorServices } from "./vendor.service";


const registerVendor = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const result = await vendorServices.registerVendor(req.body);
    SendResponse(res, {
        success: true,
        statusCode: StatusCodes.CREATED,
        message: "Vendor created!",
        data: result
    })
});



export const vendorControllers = {
    registerVendor
}