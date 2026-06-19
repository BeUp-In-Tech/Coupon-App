import { Types } from "mongoose";
import { GeoPoint } from "../../types/geo";


export interface ILocation {
  _id?: Types.ObjectId;
  shop: Types.ObjectId;
  location_name: string;
  address: {
    street: string;
    zip_code: string;
    city: string;
    state: string;
    country: string;
  }
  location: GeoPoint;
  isActive?: boolean;
}