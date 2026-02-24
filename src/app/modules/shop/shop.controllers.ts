/* eslint-disable @typescript-eslint/no-unused-vars */
import { NextFunction, Request, Response } from "express";
import { CatchAsync } from "../../utils/CatchAsync";
import { SendResponse } from "../../utils/SendResponse";
import { StatusCodes } from "http-status-codes";
import { shopServices } from "./shop.services";
import { JwtPayload } from "jsonwebtoken";


const createShop = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user as JwtPayload;
     const payload = {
      shop: {
        ...req.body.shop,
        business_logo: req.file?.path as string
      },
     outlet: req.body.outlet
    };
    
    const result = await shopServices.createShopService( user.userId, payload);
    SendResponse(res, {
        success: true,
        statusCode: StatusCodes.CREATED,
        message: "Shop created",
        data: result
    })
});


const  getShopDetails = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user as JwtPayload;
    const result = await shopServices.getShopDetailsService( user.userId);

    SendResponse(res, {
        success: true,
        statusCode: StatusCodes.CREATED,
        message: "Shop details fetched!",
        data: result
    })
});


const updateShop = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
       
    const user = req.user as JwtPayload;
    const  shopId  = req.params.shopId as string;
     const payload = {
      ...req.body,
      business_logo: req.file?.path as string
    };

    
    const result = await shopServices.updateShopService(user.userId, shopId, payload);
    SendResponse(res, {
        success: true,
        statusCode: StatusCodes.OK,
        message: "Shop updated",
        data: result
    })
});




export const shopController = {
    createShop,
    getShopDetails,
    updateShop
}