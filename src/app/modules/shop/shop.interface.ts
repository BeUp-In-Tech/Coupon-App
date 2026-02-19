import { Types } from "mongoose";

export enum ShopApproval {
    APPROVED = "APPROVED",
    PENDING = "PENDING",
    REJECTED = "REJECTED"
}

export enum LocationType {
  POINT = 'Point',
}
export interface ILocation {
  type: LocationType;
  coordinates: number[];
}

export interface IShop {
    _id?: Types.ObjectId;
    vendor: Types.ObjectId;
    business_name: string;
    business_email: string;
    business_logo: string;
    description: string;
    shop_approval: ShopApproval;
    location: ILocation;
    coord?: number[];
    zip_code: string;
    website?: string;
}