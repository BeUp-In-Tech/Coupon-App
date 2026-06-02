/* eslint-disable @typescript-eslint/no-unused-vars */
import { NextFunction, Request, Response } from "express";
import { CatchAsync } from "../../utils/CatchAsync";
import { dashboardServices } from "./dashboard.service";
import { SendResponse } from "../../utils/SendResponse";
import { StatusCodes } from "http-status-codes";

// 1. CATEGORY BY PROMOTED DEAL COUNT
const dealsByCategoryStats = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const result = await dashboardServices.dealsByCategoryStats();

    SendResponse(res,{
        success: true,
        statusCode: StatusCodes.OK,
        message: "Deals by category statistics fetched successfully",
        data: result
    });
});


// 2. VENDORS STATS
const vendorsStats = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const result = await dashboardServices.allVendorsStats(req.query as Record<string, string>);

    SendResponse(res,{
        success: true,
        statusCode: StatusCodes.OK,
        message: "Vendors statistics fetched successfully",
        data: result
    });
});


// 3. RECENT DEALS STATS
const recentDealsStats = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const result = await dashboardServices.recentDealsStats(req.query as Record<string, string>);

    SendResponse(res,{
        success: true,
        statusCode: StatusCodes.OK,
        message: "Recent deals statistics fetched successfully",
        data: result
    });
});


// 4. DEALS STATS
const dealsStats = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const result = await dashboardServices.dealsStats(req.query as Record<string, string>);

    SendResponse(res,{
        success: true,
        statusCode: StatusCodes.OK,
        message: "Deals statistics fetched successfully",
        data: result
    });
});


// 5. DASHBOARD ANALYTICS TOTAL
const dashboardAnalyticsTotal = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const result = await dashboardServices.dashboardAnalyticsTotal();

    SendResponse(res,{
        success: true,
        statusCode: StatusCodes.OK,
        message: "Dashboard total analytics counts fetched successfully",
        data: result
    });
});

// 6. LAST ONE YEAR REVENUE TREND
const getRevenueTrend = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const result = await dashboardServices.getLastYearRevenueTrend();

    SendResponse(res,{
        success: true,
        statusCode: StatusCodes.OK,
        message: "Last one yer revenue trend fetched successfully",
        data: result
    });
});


// 6. LAST ONE YEAR REVENUE TREND
const getLatestTransaction = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const result = await dashboardServices.getLatestTransaction(req.query as Record<string, string>);

    SendResponse(res,{
        success: true,
        statusCode: StatusCodes.OK,
        message: "Latest transaction fetched successfully",
        data: result
    });
});


// 6. LAST ONE YEAR REVENUE TREND
const sendNotificationAndEmail = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const result = await dashboardServices.sendNotificationAndEmail(req.body);

    SendResponse(res,{
        success: true,
        statusCode: StatusCodes.OK,
        message: "Notification and email sent successfully",
        data: result
    });
});



// EXPORT ALL THE CONTROLLERS
export const dashboardControllers = {
    dealsByCategoryStats,
    recentDealsStats,
    dealsStats,
    dashboardAnalyticsTotal,
    getRevenueTrend,
    vendorsStats,
    getLatestTransaction,
    sendNotificationAndEmail
}

