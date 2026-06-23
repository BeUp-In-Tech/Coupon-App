/* eslint-disable @typescript-eslint/no-unused-vars */
import { NextFunction, Request, Response } from "express";
import { CatchAsync } from "../../utils/CatchAsync";
import { SendResponse } from "../../utils/SendResponse";
import { StatusCodes } from "http-status-codes";
import { StaticPageService } from "./static.service";


const createStaticPage = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const result = await StaticPageService.createStaticPage(req.body);
    
    SendResponse(res, {
        success: true,
        statusCode: StatusCodes.CREATED,
        message: "Page created",
        trace_id: req.id as string,
        data: result
    })
})

const getStaticPage = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const result = await StaticPageService.getStaticPage(req.params.slug as string);
    
    SendResponse(res, {
        success: true,
        statusCode: StatusCodes.OK,
        message: "Page fetched",
        trace_id: req.id as string,
        data: result
    })
})

const getAllStaticPages = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const result = await StaticPageService.getAllStaticPages();
    
    SendResponse(res, {
        success: true,
        statusCode: StatusCodes.OK,
        message: "All Page fetched",
        trace_id: req.id as string,
        data: result
    })
})

const updateStaticPage = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const result = await StaticPageService.updateStaticPage(req.params.slug as string, req.body);
    
    SendResponse(res, {
        success: true,
        statusCode: StatusCodes.OK,
        message: "Page updated",
        trace_id: req.id as string,
        data: result
    })
})



export const StaticPageController = {
    createStaticPage,
    getStaticPage,
    getAllStaticPages,
    updateStaticPage
}
