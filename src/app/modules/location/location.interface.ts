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
  normalized?: {
    city?: string;
    state?: string;
    country?: string;
    zip_code?: string;
  };
  location: GeoPoint;
  isActive?: boolean;
}

export interface IBulkLocationRow {
  location_name: string;
  street: string;
  zip_code: string;
  city: string;
  state: string;
  country: string;
  longitude: number;
  latitude: number;
}

export interface IBulkLocationRowError {
  rowNumber: number;
  field: string;
  value: unknown;
  message: string;
}

export interface IStagedBulkLocationBatch {
  userId: string;
  shopId: string;
  totalRows: number;
  invalidRows: number;
  rows: IBulkLocationRow[];
  expiresAt: string;
}

export interface ICompletedBulkLocationImport {
  userId: string;
  result: {
    totalRows: number;
    importedCount: number;
    skippedInvalidCount: number;
  };
}
