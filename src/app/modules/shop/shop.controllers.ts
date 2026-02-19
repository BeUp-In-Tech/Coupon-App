/* eslint-disable @typescript-eslint/no-unused-vars */
import { NextFunction, Request, Response } from "express";
import { CatchAsync } from "../../utils/CatchAsync";
import { SendResponse } from "../../utils/SendResponse";
import { StatusCodes } from "http-status-codes";
import { shopServices } from "./shop.services";
import { JwtPayload } from "jsonwebtoken";


const createShop = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const payload = req.body;
    
    const user = req.user as JwtPayload;
    const result = await shopServices.createShopService( user.userId, payload);
    SendResponse(res, {
        success: true,
        statusCode: StatusCodes.CREATED,
        message: "Shop created",
        data: result
    })
});

export const shopController = {
    createShop
}