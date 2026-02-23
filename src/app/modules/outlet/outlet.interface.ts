import { Types } from "mongoose";
import { GeoPoint } from "../../types/geo";


export interface IOutlet {
  _id?: Types.ObjectId;
  shop: Types.ObjectId;

  address: string;
  zip_code: string;

  location: GeoPoint;
  isActive: boolean;

  createdAt?: Date;
  updatedAt?: Date;
}