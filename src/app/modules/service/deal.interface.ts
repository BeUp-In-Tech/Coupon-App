import { Types } from "mongoose";

export interface IDeal {
    shop: Types.ObjectId;
    category: Types.ObjectId;
    user: Types.ObjectId;
    activePromotion?: Types.ObjectId;
    title: string;
    reguler_price: number;
    discount: number;
    highlight: string[];
    deletedHighlights: [];
    description: string;
    images: string[];
    deletedImages: string[];
    isPromoted?: boolean;
    promotedUntil?: Date;
    coupon: string;
    total_views?: number;
    total_impression?: number;
    createdAt?: Date;
}   