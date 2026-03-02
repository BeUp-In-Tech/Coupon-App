/* eslint-disable @typescript-eslint/no-unused-vars */
import { NextFunction, Request, Response } from "express";
import { CatchAsync } from "../../utils/CatchAsync";
import { SendResponse } from "../../utils/SendResponse";
import { StatusCodes } from "http-status-codes";
import { servicesLayer } from "./deal.services";
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

    const result = await servicesLayer.createDealsService({ user, payload });

    SendResponse(res, {
        success: true,
        statusCode: StatusCodes.CREATED,
        message: "Service created",
        data: result
    })
});


// GET SINGLE SERVICE
const getSingleDeals = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const serviceId = req.params.serviceId as string;
    const result = await servicesLayer.getSingleDealsService( serviceId );

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

    const result = await servicesLayer.deleteDealsService( user, serviceId );

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
    
    const result = await servicesLayer.updateDealsService( user, serviceId, payload);

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
    const result = await servicesLayer.getMyDealsService( user.userId );

    SendResponse(res, {
        success: true,
        statusCode: StatusCodes.OK,
        message: "Fetched deals",
        data: result
    })
});


// GET ALL DEALS
const getAllDeals = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const query = req.query as Record<string, string>;
    const lng = Number(req.params.lng) as number;
    const lat = Number(req.params.lat) as number;
    const result = await servicesLayer.getAllDealsService(lng, lat, query);

    SendResponse(res, {
        success: true,
        statusCode: StatusCodes.OK,
        message: "Fetched all deals",
        data: result
    })
});



export const dealsControllers = {
    createDeals,
    getSingleDeals,
    deleteDeals,
    updateSingleDeals,
    getMyDeals,
    getAllDeals
}