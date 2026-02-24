/* eslint-disable @typescript-eslint/no-unused-vars */
import { NextFunction, Request, Response } from "express";
import { CatchAsync } from "../../utils/CatchAsync";
import { SendResponse } from "../../utils/SendResponse";
import { StatusCodes } from "http-status-codes";
import { JwtPayload } from "jsonwebtoken";
import { outletServices } from "./outlet.service";


const updateOutlet = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const { userId } = req.user as JwtPayload;
    const { outletId } = req.query as Record<string, string>;
  
    const result = await outletServices.updateOutletService(outletId, userId, req.body);
    
    SendResponse(res, {
        success: true,
        statusCode: StatusCodes.OK,
        message: "Outlet updated",
        data: result
    })
});


export const outletControllers = {
    updateOutlet
}