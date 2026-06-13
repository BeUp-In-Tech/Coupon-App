/* eslint-disable @typescript-eslint/no-unused-vars */
import { NextFunction, Request, Response } from "express";
import { CatchAsync } from "../../utils/CatchAsync";
import { SendResponse } from "../../utils/SendResponse";
import { StatusCodes } from "http-status-codes";
import { shopServices } from "./shop.services";
import { JwtPayload } from "jsonwebtoken";
import { ShopCreatePayload } from "./shop.interface";


const createShop = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user as JwtPayload;
     const payload = {
      shop: {
        ...req.body.shop,
        business_logo: req.file?.path as string
      },
     location: req.body.outlet
    };
    
    const result = await shopServices.createShopService( user, payload as ShopCreatePayload);
    SendResponse(res, {
        success: true,
        statusCode: StatusCodes.CREATED,
        message: "Shop created",
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


const getDealAnalytics = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user as JwtPayload;
 
    const result = await shopServices.getDealAnalyticsService(user);
    SendResponse(res, {
        success: true,
        statusCode: StatusCodes.OK,
        message: "Shop analytics fetched",
        data: result
    })
});


const getPrevious3YearsMonthlyAnalytics = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user as JwtPayload;
    // const year = Number(req.query.year);
   
    const result = await shopServices.getPrevious3YearsMonthlyAnalytics(user);

     SendResponse(res, {
        success: true,
        statusCode: StatusCodes.OK,
        message: "Shop monthly analytics fetched",
        data: result
    })
});




export const shopController = {
    createShop,
    getShopDetails,
    updateShop,
    getDealAnalytics,
    getPrevious3YearsMonthlyAnalytics
}