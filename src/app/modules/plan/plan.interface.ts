import { Types } from "mongoose";

export enum Currency {
    USD = 'USD',
    EUR = 'EUR'
}

export interface IPlan {
    _id?: Types.ObjectId;
    title: string;
    short_desc: string;
    durationDays: number;
    icon: string;
    price: number;
    currency: Currency;
}