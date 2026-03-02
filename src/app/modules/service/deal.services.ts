/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-explicit-any */
import mongoose, { Types } from 'mongoose';
import { JwtPayload } from 'jsonwebtoken';
import { Shop } from '../shop/shop.model';
import { Role } from '../user/user.interface';
import AppError from '../../errorHelpers/AppError';
import StatusCodes from 'http-status-codes';
import { deleteImageFromCLoudinary } from '../../config/cloudinary.config';
import { IDeal } from './deal.interface';
import { DealModel } from './deal.model';
import { Category } from '../categories/categories.model';


// 1. CREATE SERVICE
const createDealsService = async (params: {
  user: JwtPayload;
  payload: IDeal; // used for auto QR URL
}) => {
  const { user, payload } = params;

  // 1) CONVERT IDS
  const shopId = new Types.ObjectId(payload.shop);
  const categoryId = new Types.ObjectId(payload.category);


  // IS SHOP EXIST
  const isCategoryExist = await Category.findById(categoryId).lean();
  if(!isCategoryExist) {
    throw new AppError(StatusCodes.BAD_REQUEST, "Invalid category, category not found");
  }

  // 2) VENDOR MUST OWN THE SHOP
  if (![Role.ADMIN, Role.VENDOR].includes(user.role)) {
    throw new Error('Forbidden');
  }

  const shopQuery: Record<string, any> = { _id: shopId };

  if (user.role === Role.VENDOR) {
    shopQuery.vendor = new Types.ObjectId(user.userId);
  }

  // IS SHOP EXIST
  const shopExists = await Shop.exists(shopQuery).lean();
  if (!shopExists) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "Shop not found or you don't have permission."
    );
  }

  // NORMALIZE INPUTS O(n) BOUNDED
  const highlight = (payload.highlight || [])
    .map((h) => h.trim())
    .filter(Boolean);

  const images = (payload.images || []).map((u) => u.trim()).filter(Boolean);


  // 5) CREATE
  const finalPayload = {
    shop: shopId,
    user: new mongoose.Types.ObjectId(user.userId),
    category: isCategoryExist._id,

    title: payload.title,
    reguler_price: payload.reguler_price,
    discount: payload.discount,

    highlight,
    description: payload.description,
    images,
    coupon: payload.coupon
  };
  const doc = await DealModel.create(finalPayload);

  return doc;
}

// GET SINGLE SERVICE
const getSingleDealsService = async (serviceId: string) => {
  const isServiceExist = await DealModel.findById(serviceId).lean();
  if (!isServiceExist) {
    throw new AppError(StatusCodes.NOT_FOUND, "Service not found");
  }

  return isServiceExist;
}

// 2. DELETE SERVICE 
const deleteDealsService = async (user: JwtPayload, serviceId: string) => {
  if (user.role !== Role.VENDOR ) {
    throw new AppError(StatusCodes.FORBIDDEN, "Only vendor can delete");
  }


  // Check is service exist
  const isServiceExist = await DealModel.findById(serviceId);
  if (!isServiceExist) {
    throw new AppError(StatusCodes.NOT_FOUND, "Service not found");
  }

    // 3. Check if the vendor owns the service by shop
  const isShopOwner = await Shop.exists({ _id: isServiceExist.shop, vendor: user.userId });
  if (!isShopOwner) {
    throw new AppError(StatusCodes.UNAUTHORIZED, "You are not authorized to delete this service");
  }

  const deleteService = await DealModel.deleteOne({ _id: serviceId });
  
  if (deleteService.deletedCount > 0) {
   /*
   ========================================================================
    DELETE EXTERNAL DATA FROM OTHERS COLLECTION BY THIS ID
   ========================================================================
   */
 }

 // 6. Delete images asynchronously using promises
 setImmediate( async() => {
  try {
    const imageDeletionPromises = isServiceExist.images.map(image => deleteImageFromCLoudinary(image));
    await Promise.all(imageDeletionPromises);
  } catch (error) {
    console.error("Error deleting images from Cloudinary:", error);
  }
 })

  return null
}

// 3. UPDATE SERVICE
/**
 * @param user - Authenticated user (vendor)
 * @param serviceId - The service to update
 * @param payload - The updated data
 * @returns The updated service
 */

const updateDealsService = async (user: JwtPayload, dealId: string, payload: IDeal) => {
  // CHECK IF THE SERVICE EXISTS
  const deal = await DealModel.findById(dealId);
  if (!deal) {
    // Delete iamge from cloudinary
    if (payload.images) {
      try {
      await Promise.all(payload.images.map(i => deleteImageFromCLoudinary(i)));
    } catch (error: any) {
      console.log("Cloudinary image deletation error: ", error.message)
    }
    }

    // Throw Error
    throw new AppError(StatusCodes.NOT_FOUND, "Service not found");
  }

  // CHECK IF THE USER IS AUTHORIZED TO UPDATE THE SERVICE
  if (deal.user.toString() !== user.userId) {
    // Delete iamge from cloudinary
    if (payload.images) {
      try {
      await Promise.all(payload.images.map((i: string) => deleteImageFromCLoudinary(i)));
    } catch (error: any) {
      console.log("Cloudinary image deletation error: ", error.message)
    }
    }

    // Throw Error
    throw new AppError(StatusCodes.UNAUTHORIZED, "You are not authorized to update this service");
  }

  // ENSURE THE SERVICE CAN ONLY BE UPDATED WITHIN 30 MINUTES OF CREATION
  const serviceCreationTime = new Date(deal.createdAt as Date).getTime();
  const currentTime = Date.now();
  const timeDifference = currentTime - serviceCreationTime;
  if (timeDifference > 30 * 60 * 1000) { // 30 minutes
    // Delete iamge from cloudinary
    if (payload.images) {
      try {
      await Promise.all(payload.images.map(i => deleteImageFromCLoudinary(i)));
    } catch (error: any) {
      console.log("Cloudinary image deletation error: ", error.message)
    }
    }
    throw new AppError(StatusCodes.FORBIDDEN, "You can only update the service within 30 minutes of creation");
  }

  // INITIALIZE THE ARRAY TO HOLD THE UPDATED IMAGES
  let updatedImages: string[] = [...deal.images];

  // IMAGE UPDATE AND DELETION HANDLING
  if (payload.images && payload.images.length > 0) {
    updatedImages = [...new Set([...updatedImages, ...payload.images.map((url: string) => url.trim())])];
  }

  if (payload.deletedImages && payload.deletedImages.length > 0) {
    updatedImages = updatedImages.filter((image: string) => !payload.deletedImages.includes(image));
  }

  // HIGHLIGHT UPDATE HANDLING
  let updatedHighlights: string[] = [...deal.highlight];  // start with existing highlights

  if (payload.highlight && payload.highlight.length > 0) {
    const newHighlights = Array.isArray(payload.highlight) 
      ? payload.highlight.map((h: string) => h.trim())
      : [(payload.highlight as string).trim()];  // Single value becomes array

    updatedHighlights = [...new Set([...updatedHighlights, ...newHighlights])];
  }

  if (payload.deletedHighlights && payload.deletedHighlights.length > 0) {
    updatedHighlights = updatedHighlights.filter((highlight: string) => !(payload.deletedHighlights as string[]).includes(highlight));
  }

  // BUILD THE UPDATE PAYLOAD
  const updateData: any = {};

  if (payload.title) updateData.title = payload.title.trim();
  if (payload.description) updateData.description = payload.description.trim();
  if (payload.reguler_price !== undefined) updateData.reguler_price = payload.reguler_price;
  if (payload.discount !== undefined) updateData.discount = payload.discount;

  // ONLY UPDATE IMAGES IF CHANGES WERE MADE
  if (updatedImages.length !== deal.images.length || !updatedImages.every((val, index) => val === deal.images[index])) {
    updateData.images = updatedImages;
  }

  // ONLY UPDATE HIGHLIGHTS IF CHANGES WERE MADE
  if (updatedHighlights.length !== deal.highlight.length || !updatedHighlights.every((val, index) => val === deal.highlight[index])) {
    updateData.highlight = updatedHighlights;
  }

  // UPDATE THE SERVICE IN DATABASE
  const updatedService = await DealModel.findByIdAndUpdate(dealId, updateData, { runValidators: true, new: true });

  // DELETE IMAGES FROM CLOUDINARY ASYNCHRONOUSLY IF NEEDED
  if (payload.deletedImages && payload.deletedImages.length > 0) {
    try {
      await Promise.all(
        payload.deletedImages.map((url: string) => deleteImageFromCLoudinary(url))
      );
    } catch (error) {
      console.log(`Cloudinary image deleting error`, error);
    }
  }

  return updatedService;
};

// 4. GET MY SERVICE
const getMyDealsService = async (userId: string) => {
  const deals = await DealModel.find({ user: userId });
  return deals;
}

// 5. GET ALL SERVICES
const getAllDealsService = async (lng: number, lat: number, query: Record<string, string>) => {

  const deals = await DealModel.find();
  return {lng, lat, query, deals};
}


export const servicesLayer = {
  createDealsService,
  deleteDealsService,
  updateDealsService,
  getSingleDealsService,
  getMyDealsService,
  getAllDealsService
}
