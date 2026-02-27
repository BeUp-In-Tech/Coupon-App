/* eslint-disable @typescript-eslint/no-unused-vars */
import { NextFunction, Request, Response } from "express";
import { CatchAsync } from "../../utils/CatchAsync";
import { SendResponse } from "../../utils/SendResponse";
import { StatusCodes } from "http-status-codes";
import { JwtPayload } from "jsonwebtoken";
import { planServices } from "./plan.service";


// CREATE PLAN
const createPlan = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user as JwtPayload;
    const payload = {
        ...req.body,
        icon: req.file?.path as string
    }
    const result = await planServices.createPlanService(user,  payload);
    SendResponse(res, {
        success: true,
        statusCode: StatusCodes.CREATED,
        message: "Plan created",
        data: result
    })
});


// GET PLAN
const getPlan = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {

    const result = await planServices.getPlanService();
    SendResponse(res, {
        success: true,
        statusCode: StatusCodes.OK,
        message: "Plan fetched",
        data: result
    })
});


// UPDATE PLAN
const updatePlan = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user as JwtPayload;
    const planId = req.params.planId as string;
    const payload = {
        ...req.body,
        icon: req.file?.path as string
    }

    const result = await planServices.updatePlanService(user, planId, payload);
    SendResponse(res, {
        success: true,
        statusCode: StatusCodes.OK,
        message: "Plan updated",
        data: result
    })
});


// DELETE PLAN
const deletePlan = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user as JwtPayload;
    const planId = req.params.planId as string;

    await planServices.deletePlanService(user, planId);
    SendResponse(res, {
        success: true,
        statusCode: StatusCodes.OK,
        message: "Plan deleted",
        data: null
    })
});


export const planControllers = {
    createPlan,
    getPlan,
    updatePlan,
    deletePlan
}