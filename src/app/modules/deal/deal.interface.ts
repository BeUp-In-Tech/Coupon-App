import { Types } from "mongoose";
import { DealDiscountType } from "./deal.constant";

export interface IDeal {
    _id?: Types.ObjectId;
    shop: Types.ObjectId;
    category: Types.ObjectId;
    user: Types.ObjectId;
    activePromotion?: Types.ObjectId;
    title: string;
    regular_price: number;
    discount: number;
    discount_type?: DealDiscountType;
    minimum_purchase?: number;
    highlight: string[];
    deletedHighlights?: [];
    tags: string[];
    deletedTags?: string[];
    description: string;
    images: string[];
    deletedImages: string[];
    isPromoted?: boolean;
    promotedUntil?: Date;
    coupon: string;
    coupon_required?: boolean;
    coupon_option: {
        qr?: string;
        upc?: string;
    }
    nationwide?: true | false;
    available_in_location?: [Types.ObjectId];
    isBanned?: boolean;
    ban_reason?: string;
    bannedAt?: Date;
    bannedBy?: Types.ObjectId;
    unbannedAt?: Date;
    unbannedBy?: Types.ObjectId;
    createdAt?: Date;
}   
