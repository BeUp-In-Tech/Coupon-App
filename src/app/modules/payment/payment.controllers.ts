/* eslint-disable @typescript-eslint/no-unused-vars */
import { NextFunction, Request, Response } from "express";
import { CatchAsync } from "../../utils/CatchAsync";
import { SendResponse } from "../../utils/SendResponse";
import { StatusCodes } from "http-status-codes";
import { paymentService } from "./payment.services";
import { JwtPayload } from 'jsonwebtoken';


// GOOGLE IN-APP PURCHASE
const appleInAppPurchase = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const result = await paymentService.appleInAppPurchase(req.body);
    SendResponse(res, {
        success: true,
        statusCode: StatusCodes.OK,
        message: "Apple in app purchase completed",
        trace_id: req.id as string,
        data: result
    })
})

// GOOGLE IN-APP PURCHASE
const googleInAppPurchase = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const result = await paymentService.googleInAppPurchase(req.body);
    SendResponse(res, {
        success: true,
        statusCode: StatusCodes.OK,
        message: "Google in app purchase completed",
        trace_id: req.id as string,
        data: result
    })
})

// STRIPE CHECKOUT
const stripePayment = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user as JwtPayload;
    const {dealId, planId, voucher} = req.body;
    
    const result = await paymentService.stripePay(user, dealId, planId, voucher);
    SendResponse(res, {
        success: true,
        statusCode: StatusCodes.CREATED,
        message: "Checkout session created",
        trace_id: req.id as string,
        data: result
    })
})

// STRIPE WEBHOOK
const stripeWebhook = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
 
    const result = await paymentService.stripeWebhookHandling(req);
    SendResponse(res, {
        success: true,
        statusCode: StatusCodes.OK,
        message: "Webhook Listened",
        trace_id: req.id as string,
        data: result
    })
})


// GET TRANSACTION HISTORY
const getTransactionHistory = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user as JwtPayload;
    const query = req.query as Record<string, string>;
    const result = await paymentService.getTransactionHistory(user, query);
    SendResponse(res, {
        success: true,
        statusCode: StatusCodes.OK,
        message: "Transaction history fetched",
        trace_id: req.id as string,
        data: result
    })
})

// EXPORT CONTROLLERS
export const paymentControllers = {
    stripePayment,
    stripeWebhook,
    googleInAppPurchase,
    appleInAppPurchase,
    getTransactionHistory
}
