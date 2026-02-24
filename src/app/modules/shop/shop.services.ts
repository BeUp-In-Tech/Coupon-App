/* eslint-disable @typescript-eslint/no-explicit-any */
import { StatusCodes } from 'http-status-codes';
import AppError from '../../errorHelpers/AppError';
import User from '../user/user.model';
import { IShop } from './shop.interface';
import { Shop } from './shop.model';
import { deleteImageFromCLoudinary } from '../../config/cloudinary.config';
import { Role } from '../user/user.interface';
import mongoose, { Types } from 'mongoose';
import { OutletModel } from '../outlet/outlet.model';


// Custom interface
interface ShopCreatePayload {
  shop: IShop;
  outlet: {
      // outlet_name: string;
      address: string;
      zip_code: string;
      coordinates: [number, number];
    }[]
   
}


// CREATE SHOP
export const createShopService = async (userId: string, payload: ShopCreatePayload) => {
  if (!payload.shop.business_logo) throw new Error("business_logo missing"); // controller bug catch

  const vendorId = new Types.ObjectId(userId);

  // Security rule: 1 vendor => 1 shop (remove if you allow multiple)
  const alreadyHasShop = await Shop.findOne({ vendor: vendorId }).select("_id").lean();
  if (alreadyHasShop) throw new Error("Shop already exists for this vendor");

  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    // 1) Create shop
    const [shopDoc] = await Shop.create(
      [
        {
          vendor: vendorId,
          business_name: payload.shop.business_name.trim(),
          business_email: payload.shop.business_email.toLowerCase().trim(),
          business_logo: payload.shop.business_logo,
          description: payload.shop.description.trim(),
          website: payload.shop.website?.trim(),
          coord: payload.shop.coord
        },
      ],
      { session }
    );

    // 2) Create outlets linked to shop
    const outlets = (payload.outlet || []).map((o) => ({
      shop: shopDoc._id,
      vendor: vendorId,
      // outlet_name: o.outlet_name,
      address: o.address.trim(),
      zip_code: o.zip_code.trim(),
      location: {
        type: "Point",
        coordinates: [...o.coordinates],
      },
    }));

    if (outlets.length) {
      await OutletModel.insertMany(outlets, { session, ordered: true });
    }

    await session.commitTransaction();
    session.endSession();

    return {
      shop: shopDoc,
      outlets_created: outlets.length,
    };
  } catch (err: any) {
    await session.abortTransaction();
    session.endSession();

    // Duplicate key handling (unique index errors)
    if (err?.code === 11000) {
      throw new Error(`Duplicate key: ${JSON.stringify(err.keyValue)}`);
    }

    throw err;
  }
};

// GET SHOP DETAILS
const getShopDetailsService = async (userId: string) => {
  const isShopExist = await Shop.findOne({ vendor: userId });

  if (!isShopExist) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Shop not found');
  }

  return isShopExist;
};


// UPDATE SHOP
const updateShopService = async (
  userId: string,
  shopId: string,
  payload: Partial<IShop>
) => {
  // 1. ensure user exists
  const user = await User.findById(userId).select('_id role');
  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, 'User not found');
  }

  // 2. Build filter
  const filter: Record<string, any> = { _id: shopId };
  if (user.role === Role.VENDOR) {
    filter.vendor = user._id; // only vendor ownership enforced
  }

  if (user.role !== Role.VENDOR && user.role !== Role.ADMIN) {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      'Only vendors and admin can update shop'
    );
  }

  // 3. Shop existance
  const shop = await Shop.findById(shopId).select('business_logo');
  if (!shop) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Shop not found');
  }

  // 4. build controlled update object
  const updateData: Record<string, any> = {};

  if (payload.business_name) updateData.business_name = payload.business_name;

  if (payload.description) updateData.description = payload.description;

  if (payload.website !== undefined) updateData.website = payload.website;

  if (payload.shop_approval) {
    if (user.role !== Role.ADMIN) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        'Only admin can change approval status'
      );
    }

    // Update status
    updateData.shop_approval = payload.shop_approval;
  }

  // 5. coord → GeoJSON
  if (payload.coord) {
    updateData.location = {
      type: 'Point',
      coordinates: payload.coord,
    };
  }

  // 6. If have image, delete previous one
  if (payload.business_logo) {
    updateData.business_logo = payload.business_logo;
  }

  // 7. prevent empty update
  if (Object.keys(updateData).length === 0) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'No valid fields provided for update'
    );
  }

  // 8. atomic ownership update
  const validator = { new: true, runValidators: true };
  const updatedShop = await Shop.findOneAndUpdate(
    filter,
    updateData,
    validator
  );

  if (!updatedShop) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Shop not found or unauthorized');
  }

  // DELETE EXISTING IMAGE ASYNCHRONOUSLY TO PREVENT LOAD FOR MAIN API RESPONSE
  setImmediate(async () => {
    // Delete old business logo
    deleteImageFromCLoudinary(shop.business_logo);

    // send notification to vendor
  });

  return updatedShop;
};

export const shopServices = {
  createShopService,
  getShopDetailsService,
  updateShopService,
};
