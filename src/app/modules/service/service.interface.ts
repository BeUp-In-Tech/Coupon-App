import { Types } from "mongoose";

export enum CouponType {
    COUPON_CODE = 'COUPON_CODE',
    QR_CODE = 'QR_CODE',
    UPC_CODE = 'UPC_CODE',
    NONE = 'NONE'
}


export interface IService {
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
    couponType: CouponType,
    coupon: {
        coupon_code?: string;
        qr_code?: string;
        upc_code?: string;
    }
    total_views?: number;
    total_impression?: number;
}   