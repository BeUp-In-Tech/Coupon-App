/* eslint-disable @typescript-eslint/no-unused-vars */
import { NextFunction, Request, Response } from "express";
import { CatchAsync } from "../../utils/CatchAsync";
import { dashboardServices } from "./dashboard.service";
import { SendResponse } from "../../utils/SendResponse";
import { StatusCodes } from "http-status-codes";
import { JwtPayload } from "jsonwebtoken";

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


// 3. EXPORT VENDORS LIST IN XLSX
const exportVendorsList = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user as JwtPayload;
    const result = await dashboardServices.exportVendorsList(user);

    SendResponse(res,{
        success: true,
        statusCode: StatusCodes.ACCEPTED,
        message: "Vendor XLSX export queued successfully",
        data: result
    });
});

const getVendorExportStatus = CatchAsync(async (req: Request, res: Response) => {
    const user = req.user as JwtPayload;
    const result = await dashboardServices.getVendorExportStatus(
        user,
        req.params.jobId as string
    );

    SendResponse(res, {
        success: true,
        statusCode: StatusCodes.OK,
        message: "Vendor export status fetched successfully",
        data: result
    });
});

// Stream the completed workbook as a binary attachment instead of a JSON response.
const downloadVendorExport = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user as JwtPayload;
    const result = await dashboardServices.downloadVendorExport(
        user,
        req.params.jobId as string
    );

    res.set({
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Transfer-Encoding': 'binary',
        'Cache-Control': `private, max-age=${result.cacheMaxAge}`,
        'X-Content-Type-Options': 'nosniff'
    });
    res.download(result.filePath, result.fileName, (error) => {
        if (!error) return;
        if (res.headersSent) {
            res.destroy(error);
            return;
        }
        next(error);
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

// 7. BAN DEAL BY ADMIN
const banDealByAdmin = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user as JwtPayload;
    const dealId = req.params.dealId as string;
    const result = await dashboardServices.banDealByAdmin(user, dealId, req.body);

    SendResponse(res,{
        success: true,
        statusCode: StatusCodes.OK,
        message: "Deal banned successfully",
        data: result
    });
});

// 8. UNBAN DEAL BY ADMIN
const unbanDealByAdmin = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user as JwtPayload;
    const dealId = req.params.dealId as string;
    const result = await dashboardServices.unbanDealByAdmin(user, dealId);

    SendResponse(res,{
        success: true,
        statusCode: StatusCodes.OK,
        message: "Deal unbanned successfully",
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
    sendNotificationAndEmail,
    banDealByAdmin,
    unbanDealByAdmin,
    exportVendorsList,
    getVendorExportStatus,
    downloadVendorExport
}

