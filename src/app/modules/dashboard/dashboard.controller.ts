/* eslint-disable @typescript-eslint/no-unused-vars */
import { NextFunction, Request, Response } from 'express';
import { CatchAsync } from '../../utils/CatchAsync';
import { dashboardServices } from './dashboard.service';
import { SendResponse } from '../../utils/SendResponse';
import { StatusCodes } from 'http-status-codes';
import { JwtPayload } from 'jsonwebtoken';
import AppError from '../../errorHelpers/AppError';

// 1. DEALS BY CATEGORY STATS
const dealsByCategoryStats = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const result = await dashboardServices.dealsByCategoryStats();
    SendResponse(res, { success: true, statusCode: StatusCodes.OK, message: 'Deals by category statistics fetched successfully', trace_id: req.id as string, data: result });
});

// 2. VENDORS STATS
const vendorsStats = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const result = await dashboardServices.allVendorsStats(req.query as Record<string, string>);
    SendResponse(res, { success: true, statusCode: StatusCodes.OK, message: 'Vendors statistics fetched successfully', trace_id: req.id as string, data: result });
});

// 3. EXPORT VENDORS LIST IN XLSX
const exportVendorsList = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user as JwtPayload;
    const result = await dashboardServices.exportVendorsList(user);
    SendResponse(res, { success: true, statusCode: StatusCodes.ACCEPTED, message: 'Vendor XLSX export queued successfully', trace_id: req.id as string, data: result });
});

const getVendorExportStatus = CatchAsync(async (req: Request, res: Response) => {
    const user = req.user as JwtPayload;
    const result = await dashboardServices.getVendorExportStatus(user, req.params.jobId as string);
    SendResponse(res, { success: true, statusCode: StatusCodes.OK, message: 'Vendor export status fetched successfully', trace_id: req.id as string, data: result });
});

const downloadVendorExport = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user as JwtPayload;
    const result = await dashboardServices.downloadVendorExport(user, req.params.jobId as string);
    res.set({
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Transfer-Encoding': 'binary',
        'Cache-Control': `private, max-age=${result.cacheMaxAge}`,
        'X-Content-Type-Options': 'nosniff',
    });
    res.download(result.filePath, result.fileName, (error) => {
        if (!error) return;
        if (res.headersSent) { res.destroy(error); return; }
        next(error);
    });
});

// 4. RECENT DEALS STATS
const recentDealsStats = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const result = await dashboardServices.recentDealsStats(req.query as Record<string, string>);
    SendResponse(res, { success: true, statusCode: StatusCodes.OK, message: 'Recent deals statistics fetched successfully', trace_id: req.id as string, data: result });
});

// 5. DEALS STATS
const dealsStats = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const result = await dashboardServices.dealsStats(req.query as Record<string, string>);
    SendResponse(res, { success: true, statusCode: StatusCodes.OK, message: 'Deals statistics fetched successfully', trace_id: req.id as string, data: result });
});

// 6. DASHBOARD ANALYTICS TOTAL
const dashboardAnalyticsTotal = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const result = await dashboardServices.dashboardAnalyticsTotal();
    SendResponse(res, { success: true, statusCode: StatusCodes.OK, message: 'Dashboard total analytics counts fetched successfully', trace_id: req.id as string, data: result });
});

// 7. LAST ONE YEAR REVENUE TREND
const getRevenueTrend = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const result = await dashboardServices.getLastYearRevenueTrend();
    SendResponse(res, { success: true, statusCode: StatusCodes.OK, message: 'Last one year revenue trend fetched successfully', trace_id: req.id as string, data: result });
});

// 8. LATEST TRANSACTIONS
const getLatestTransaction = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const result = await dashboardServices.getLatestTransaction(req.query as Record<string, string>);
    SendResponse(res, { success: true, statusCode: StatusCodes.OK, message: 'Latest transaction fetched successfully', trace_id: req.id as string, data: result });
});

// 9. SEND SYSTEM NOTIFICATION AND EMAIL
const sendNotificationAndEmail = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const result = await dashboardServices.sendNotificationAndEmail(req.body);
    SendResponse(res, { success: true, statusCode: StatusCodes.OK, message: 'Notification and email sent successfully', trace_id: req.id as string, data: result });
});

// 10. BAN DEAL BY ADMIN
const banDealByAdmin = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user as JwtPayload;
    const dealId = req.params.dealId as string;
    const result = await dashboardServices.banDealByAdmin(user, dealId, req.body);
    SendResponse(res, { success: true, statusCode: StatusCodes.OK, message: 'Deal banned successfully', trace_id: req.id as string, data: result });
});

// 11. UNBAN DEAL BY ADMIN
const unbanDealByAdmin = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user as JwtPayload;
    const dealId = req.params.dealId as string;
    const result = await dashboardServices.unbanDealByAdmin(user, dealId);
    SendResponse(res, { success: true, statusCode: StatusCodes.OK, message: 'Deal unbanned successfully', trace_id: req.id as string, data: result });
});

// 12. ADMIN CITY SEED — upload CSV/XLSX to bulk-create system Location records
const seedCitiesFromFile = CatchAsync(async (req: Request, res: Response, _next: NextFunction) => {
    if (!req.file) {
        throw new AppError(StatusCodes.BAD_REQUEST, 'A CSV or XLSX file is required');
    }
    const user   = req.user as JwtPayload;
    const dryRun = req.query.dryRun === 'true';
    const result = await dashboardServices.seedCitiesFromFile(req.file, user.userId, dryRun);
    SendResponse(res, {
        success: true,
        statusCode: StatusCodes.OK,
        message: dryRun
            ? 'Dry run complete — no data was written'
            : `City seeding complete. ${result.inserted} location(s) inserted.`,
        trace_id: req.id as string,
        data: result,
    });
});

// 13. ADMIN CITY SEED TEMPLATE — download the XLSX template
const downloadCitySeedTemplate = CatchAsync(async (_req: Request, res: Response, _next: NextFunction) => {
    const ExcelJS  = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    const sheet    = workbook.addWorksheet('Cities', { views: [{ state: 'frozen', ySplit: 1 }] });

    sheet.columns = [
        { header: 'City',  key: 'city',  width: 24 },
        { header: 'State', key: 'state', width: 28 },
    ];
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
    sheet.addRow({ city: 'New York',    state: 'New York'   });
    sheet.addRow({ city: 'Los Angeles', state: 'California' });
    sheet.getRow(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    res.set({
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="city-seed-template.xlsx"',
        'Content-Length': buffer.length.toString(),
    });
    res.send(buffer);
});

// EXPORT ALL CONTROLLERS
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
    downloadVendorExport,
    seedCitiesFromFile,
    downloadCitySeedTemplate,
};
