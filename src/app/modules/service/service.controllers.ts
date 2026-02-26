/* eslint-disable @typescript-eslint/no-unused-vars */
import { NextFunction, Request, Response } from "express";
import { CatchAsync } from "../../utils/CatchAsync";
import { SendResponse } from "../../utils/SendResponse";
import { StatusCodes } from "http-status-codes";
import { servicesLayer } from "./service.services";
import { JwtPayload } from "jsonwebtoken";


// CREATE SHOP
const createService = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user as JwtPayload;

    const payload = {
      ...req.body,
      images: req.files
        ? (req.files as Express.Multer.File[]).map((file) => file.path)
        : [],
    };

    const result = await servicesLayer.createService({ user, payload });

    SendResponse(res, {
        success: true,
        statusCode: StatusCodes.CREATED,
        message: "Service created",
        data: result
    })
});



// DELETE SHOP
const deleteService = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user as JwtPayload;
    const serviceId = req.params.serviceId as string;

    const result = await servicesLayer.deleteService( user, serviceId );

    SendResponse(res, {
        success: true,
        statusCode: StatusCodes.OK,
        message: "Service deleted",
        data: result
    })
});


// DELETE SHOP
const updateService = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user as JwtPayload;
    const serviceId = req.params.serviceId as string;
    const payload = {
      ...req.body,
      images: req.files
        ? (req.files as Express.Multer.File[]).map((file) => file.path)
        : [],
    };
    

    const result = await servicesLayer.updateService( user, serviceId, payload);

    SendResponse(res, {
        success: true,
        statusCode: StatusCodes.OK,
        message: "Service updated",
        data: result
    })
});



export const serviceControllers = {
    createService,
    deleteService,
    updateService
}