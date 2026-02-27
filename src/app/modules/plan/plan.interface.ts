import { Types } from "mongoose";

type Currency = "usd" | "eur";

export interface IPlan {
    _id?: Types.ObjectId;
    title: string;
    short_desc: string;
    durationDays: number;
    icon: string;
    price: number;
    currency: Currency;
}