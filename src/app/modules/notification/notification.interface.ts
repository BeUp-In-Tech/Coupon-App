import { Types } from "mongoose";


export enum NotificationType {
    SHOP = "SHOP",
    PROMOTE = "PROMOTE",
    EXPIRATION = "EXPIRATION",
    REMINDER = "REMINDER",
    PAYMENT = "PAYMENT",
    SYSTEM = "SYSTEM"
}

export interface INotification {
    _id?: Types.ObjectId;
    user: Types.ObjectId;
    title: string;
    body: string;
    type: NotificationType;
    isRead: boolean;
    entityId: string;
    webUrl: string;
    deepLink: string;
}