import { Types } from "mongoose";

export enum ShopApproval {
    APPROVED = "APPROVED",
    PENDING = "PENDING",
    REJECTED = "REJECTED"
}


export interface IShop {
    _id?: Types.ObjectId;
    vendor: Types.ObjectId;
    business_name: string;
    business_email: string;
    business_phone: {
        country_code: string,
        phone_number: string
    };
    business_logo: string;
    description: string;
    shop_approval: ShopApproval;
    coord?: number[];
    website?: string;
}