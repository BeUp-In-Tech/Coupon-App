import { StatusCodes } from "http-status-codes";
import AppError from "../../errorHelpers/AppError";
import User from "../user/user.model";
import { IShop, LocationType, ShopApproval } from "./shop.interface";
import { Shop } from "./shop.model";


const createShopService = async (userId: string, payload: IShop) => {
  // 1. Validate user existence
  const user = await User.findById(userId).select("_id role");
  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, "User not found");
  }
  

  // 1.1. Input coord into Location
  if (payload.coord) {
    payload.location = {
      type: LocationType.POINT,
      coordinates: [...payload.coord]
    }
  }

  // 2. Role check
  if (user.role !== "VENDOR") {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      "Only vendors can create shops"
    );
  }

  // 3. Prevent duplicate shop per vendor
  const existingShop = await Shop.findOne({ vendor: user._id }).select("_id");
  if (existingShop) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "Vendor already has a shop"
    );
  }

  // 4. Prevent duplicate business email
  const emailExists = await Shop.findOne({
    business_email: payload.business_email.toLowerCase(),
  }).select("_id");

  if (emailExists) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "Business email already in use"
    );
  }

  // 5. Create shop (controlled fields only)
  const shop = await Shop.create({
    vendor: user._id, // override vendor
    business_name: payload.business_name,
    business_email: payload.business_email.toLowerCase(),
    business_logo: payload.business_logo,
    description: payload.description,
    location: payload.location,
    zip_code: payload.zip_code,
    website: payload.website,
    shop_approval: ShopApproval.PENDING, // force default
  });

  return shop;
};

const getShopDetailsService = async (userId: string) => {
  const isShopExist = await Shop.findOne({vendor: userId});

  if (!isShopExist) {
    throw new AppError(StatusCodes.NOT_FOUND, "Shop not found");
  }

  return isShopExist;
}


export const shopServices = {
    createShopService,
    getShopDetailsService
}