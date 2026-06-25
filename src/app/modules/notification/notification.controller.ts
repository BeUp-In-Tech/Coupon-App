/* eslint-disable @typescript-eslint/no-unused-vars */
import { NextFunction, Request, Response } from "express";
import { CatchAsync } from "../../utils/CatchAsync";
import { SendResponse } from "../../utils/SendResponse";
import { StatusCodes } from "http-status-codes";
import { notificationService } from "./notification.service";
import { JwtPayload } from "jsonwebtoken";

const getNotificationClientId = (req: Request) => {
    const headerClientId = req.headers['x-notification-client-id'];
    const queryClientId = req.query.clientId;

    if (typeof headerClientId === 'string') {
        return headerClientId;
    }

    if (Array.isArray(headerClientId)) {
        return headerClientId[0];
    }

    if (typeof queryClientId === 'string') {
        return queryClientId;
    }

    return undefined;
};

// GET ALL NOTIFICATION
const readAllNotification = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const query = req.query as Record<string, string>;
    const user = req.user as JwtPayload | undefined;
    const result = await notificationService.readAllNotificationService(query, user?.userId as string | undefined, getNotificationClientId(req));

    SendResponse(res, {
        success: true,
        statusCode: StatusCodes.OK,
        message: "Notification fetched successfully",
        trace_id: req.id as string,
        data: result
    })
});

// OPEN NOTIFICATION PANEL
const openNotificationPanel = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user as JwtPayload | undefined;
    const result = await notificationService.openNotificationPanelService(user?.userId as string | undefined, getNotificationClientId(req));

    SendResponse(res, {
        success: true,
        statusCode: StatusCodes.OK,
        message: "Notification panel opened successfully",
        trace_id: req.id as string,
        data: result
    })
});

// GET SINGLE NOTIFICATION
const getSingleNotification = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const notificationId = req.params.id as string;
    const user = req.user as JwtPayload | undefined;
    const result = await notificationService.getSingleNotificationService(notificationId, user?.userId as string | undefined, getNotificationClientId(req));

    SendResponse(res, {
        success: true,
        statusCode: StatusCodes.OK,
        message: "Notification fetched successfully",
        trace_id: req.id as string,
        data: result
    })
});

export const NotificationController = {
    readAllNotification,
    openNotificationPanel,
    getSingleNotification
}
