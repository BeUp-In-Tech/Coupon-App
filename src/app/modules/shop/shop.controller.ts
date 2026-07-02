/* eslint-disable @typescript-eslint/no-unused-vars */
import { NextFunction, Request, Response } from "express";
import { CatchAsync } from "../../utils/CatchAsync";
import { SendResponse } from "../../utils/SendResponse";
import { StatusCodes } from "http-status-codes";
import { shopServices } from "./shop.service";
import { JwtPayload } from "jsonwebtoken";
import { IShop } from "./shop.interface";


const createShop = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user as JwtPayload;
     const payload = {
        ...req.body,
        business_logo: req.file?.path as string
    };
    
    const result = await shopServices.createShopService( user, payload as IShop);
    SendResponse(res, {
        success: true,
        statusCode: StatusCodes.CREATED,
        message: "Shop created",
        trace_id: req.id as string,
        data: result
    })
});


const  getShopDetails = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const shopId = req.query.shopId as  string;
    const my_shop = req.query.myId as string;
    const result = await shopServices.getShopDetailsService(shopId, my_shop);

    SendResponse(res, {
        success: true,
        statusCode: StatusCodes.OK,
        message: "Shop details fetched!",
        trace_id: req.id as string,
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
        trace_id: req.id as string,
        data: result
    })
});


const getShopAnalytics = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user as JwtPayload;
 
    const result = await shopServices.getShopAnalyticsService(user);
    SendResponse(res, {
        success: true,
        statusCode: StatusCodes.OK,
        message: "Shop analytics fetched",
        trace_id: req.id as string,
        data: result
    })
});


const last30DaysStats = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user as JwtPayload;
    // const year = Number(req.query.year);
   
    const result = await shopServices.last30DaysStats(user);

     SendResponse(res, {
        success: true,
        statusCode: StatusCodes.OK,
        message: "Shop monthly analytics fetched",
        trace_id: req.id as string,
        data: result
    })
});




export const shopController = {
    createShop,
    getShopDetails,
    updateShop,
    getShopAnalytics,
    last30DaysStats
}
