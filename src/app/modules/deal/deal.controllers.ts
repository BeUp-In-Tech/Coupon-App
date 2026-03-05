/* eslint-disable @typescript-eslint/no-unused-vars */
import { NextFunction, Request, Response } from "express";
import { CatchAsync } from "../../utils/CatchAsync";
import { SendResponse } from "../../utils/SendResponse";
import { StatusCodes } from "http-status-codes";
import { dealsServices } from "./deal.services";
import { JwtPayload } from "jsonwebtoken";


// CREATE SHOP
const createDeals = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user as JwtPayload;

    const payload = {
      ...req.body,
      images: req.files
        ? (req.files as Express.Multer.File[]).map((file) => file.path)
        : [],
    };

    const result = await dealsServices.createDealsService({ user, payload });

    SendResponse(res, {
        success: true,
        statusCode: StatusCodes.CREATED,
        message: "Service created",
        data: result
    })
});


// VIEW DEAL
const getSingleDeals = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const dealId = req.params.serviceId as string;
    const result = await dealsServices.getSingleDealsService( dealId );

    SendResponse(res, {
        success: true,
        statusCode: StatusCodes.OK,
        message: "Service fetched",
        data: result
    })
});


// DELETE SHOP
const deleteDeals = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user as JwtPayload;
    const serviceId = req.params.serviceId as string;

    const result = await dealsServices.deleteDealsService( user, serviceId );

    SendResponse(res, {
        success: true,
        statusCode: StatusCodes.OK,
        message: "Service deleted",
        data: result
    })
});


// DELETE SHOP
const updateSingleDeals = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user as JwtPayload;
    const serviceId = req.params.serviceId as string;
    const payload = {
      ...req.body,
      images: req.files
        ? (req.files as Express.Multer.File[]).map((file) => file.path)
        : [],
    };
    
    const result = await dealsServices.updateDealsService( user, serviceId, payload);

    SendResponse(res, {
        success: true,
        statusCode: StatusCodes.OK,
        message: "Service updated",
        data: result
    })
});


// DELETE SHOP
const getMyDeals = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user as JwtPayload;
    const query = req.query as Record<string, string>;
    const result = await dealsServices.getMyDealsService( user.userId, query );

    SendResponse(res, {
        success: true,
        statusCode: StatusCodes.OK,
        message: "Fetched deals",
        data: result
    })
});


// GET NEAREST DEALS
const getNearestDeals = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const query = req.query as Record<string, string>;
    const lng = Number(req.params.lng) as number;
    const lat = Number(req.params.lat) as number;
    const result = await dealsServices.getNearestDealsService(lng, lat, query);

    SendResponse(res, {
        success: true,
        statusCode: StatusCodes.OK,
        message: "Fetched all deals",
        data: result
    })
});

// GET ALL DEALS
const getAllDeals = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const query = req.query as Record<string, string>;
    const lng = Number(req.params.lng);
    const lat = Number(req.params.lat);
    
    const result = await dealsServices.getAllDealsService(lng, lat, query);

    SendResponse(res, {
        success: true,
        statusCode: StatusCodes.OK,
        message: "All deals fetched",
        data: result
    })
})



export const dealsControllers = {
    createDeals,
    getSingleDeals,
    deleteDeals,
    updateSingleDeals,
    getMyDeals,
    getNearestDeals,
    getAllDeals
}