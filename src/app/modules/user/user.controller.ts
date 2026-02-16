/* eslint-disable @typescript-eslint/no-unused-vars */
import { NextFunction, Request, Response } from "express";
import { CatchAsync } from "../../utils/CatchAsync";
import { SendResponse } from "../../utils/SendResponse";
import { StatusCodes } from "http-status-codes";
import { userServices } from "./user.service";



const registerVendor = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const result = await userServices.registerUser(req.body);
    SendResponse(res, {
        success: true,
        statusCode: StatusCodes.CREATED,
        message: "Vendor created!",
        data: result
    })
});



export const userControllers = {
    registerVendor
}