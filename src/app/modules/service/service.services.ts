/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { ServiceModel } from './service.model';
import mongoose, { Types } from 'mongoose';
import {  CouponType, IService } from './service.interface';
import { JwtPayload } from 'jsonwebtoken';
import { Shop } from '../shop/shop.model';
import { Role } from '../user/user.interface';
import AppError from '../../errorHelpers/AppError';
import StatusCodes from 'http-status-codes';
import env from '../../config/env';
import { deleteImageFromCLoudinary } from '../../config/cloudinary.config';


// 1. CREATE SERVICE
const createService = async (params: {
  user: JwtPayload;
  payload: IService; // used for auto QR URL
}) => {
  const { user, payload } = params;

  // 1) Convert ids once
  const shopId = new Types.ObjectId(payload.shop);
  const categoryId = new Types.ObjectId(payload.category);

  // 2) Authorization: vendor must own the shop (admin bypass)
  // Adjust "vendor" to your actual field (owner/vendorId/etc.)
  if (![Role.ADMIN, Role.VENDOR].includes(user.role)) {
    throw new Error('Forbidden');
  }

  const shopQuery: Record<string, any> = { _id: shopId };

  if (user.role === Role.VENDOR) {
    shopQuery.vendor = new Types.ObjectId(user.userId);
  }

  // Is shop exist
  const shopExists = await Shop.exists(shopQuery);
  if (!shopExists) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "Shop not found or you don't have permission."
    );
  }

  // 3) Normalize inputs (O(n) bounded)

  const highlight = (payload.highlight || [])
    .map((h) => h.trim())
    .filter(Boolean);

  const images = (payload.images || []).map((u) => u.trim()).filter(Boolean);


  // 4) Single-write QR auto generation (generate _id first)
  const _id = new Types.ObjectId();

 
  // Handle Coupon_code, Upc_code, qr_code here
  let coupon: Record<string, string> = {};

  if (payload.couponType === CouponType.COUPON_CODE) {
    coupon.coupon_code = payload.coupon.coupon_code as string;
  }

  switch (payload.couponType) {
    case CouponType.COUPON_CODE:
      coupon.coupon_code = payload.coupon.coupon_code as string;
      break
    case CouponType.QR_CODE:
      coupon.coupon_code = payload.coupon.coupon_code as string;
      coupon.qr_code = `${env.BACKEND_URL}/api/v1/s/${_id}?type=${CouponType.QR_CODE}`;
      break
    case CouponType.UPC_CODE:
      coupon.coupon_code = payload.coupon.coupon_code as string;
      coupon.upc_code = payload.coupon.upc_code as string;
      break
    default: 
    coupon = {...payload.coupon }
  }

  // 5) Create
  const finalPayload = {
    _id,
    shop: shopId,
    user: new mongoose.Types.ObjectId(user.userId),
    category: categoryId,

    title: payload.title,
    reguler_price: payload.reguler_price,
    discount: payload.discount,

    highlight,
    description: payload.description,
    images,
 
    couponType: payload.couponType,
    coupon
  };
  const doc = await ServiceModel.create(finalPayload);

  return doc;
}


// 2. DELETE SERVICE 
const deleteService = async (user: JwtPayload, serviceId: string) => {
  if (user.role !== Role.VENDOR ) {
    throw new AppError(StatusCodes.FORBIDDEN, "Only vendor can delete");
  }


  // Check is service exist
  const isServiceExist = await ServiceModel.findById(serviceId);
  if (!isServiceExist) {
    throw new AppError(StatusCodes.NOT_FOUND, "Service not found");
  }

    // 3. Check if the vendor owns the service by shop
  const isShopOwner = await Shop.exists({ _id: isServiceExist.shop, vendor: user.userId });
  if (!isShopOwner) {
    throw new AppError(StatusCodes.UNAUTHORIZED, "You are not authorized to delete this service");
  }

  const deleteService = await ServiceModel.deleteOne({ _id: serviceId });
  
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

export const updateService = async (user: JwtPayload, serviceId: string, payload: IService) => {
  // CHECK IF THE SERVICE EXISTS
  const service = await ServiceModel.findById(serviceId);
  if (!service) {
    throw new AppError(StatusCodes.NOT_FOUND, "Service not found");
  }

  // CHECK IF THE USER IS AUTHORIZED TO UPDATE THE SERVICE
  if (service.user.toString() !== user.userId) {
    throw new AppError(StatusCodes.UNAUTHORIZED, "You are not authorized to update this service");
  }

  // ENSURE THE SERVICE CAN ONLY BE UPDATED WITHIN 30 MINUTES OF CREATION
  const serviceCreationTime = new Date(service.createdAt).getTime();
  const currentTime = Date.now();
  const timeDifference = currentTime - serviceCreationTime;
  if (timeDifference > 30 * 60 * 1000) { // 30 minutes
    throw new AppError(StatusCodes.FORBIDDEN, "You can only update the service within 30 minutes of creation");
  }

  // INITIALIZE THE ARRAY TO HOLD THE UPDATED IMAGES
  let updatedImages: string[] = [...service.images];

  // IMAGE UPDATE AND DELETION HANDLING
  if (payload.images && payload.images.length > 0) {
    updatedImages = [...new Set([...updatedImages, ...payload.images.map((url: string) => url.trim())])];
  }

  if (payload.deletedImages && payload.deletedImages.length > 0) {
    updatedImages = updatedImages.filter((image: string) => !payload.deletedImages.includes(image));
  }

  // HIGHLIGHT UPDATE HANDLING
  let updatedHighlights: string[] = [...service.highlight];  // start with existing highlights

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
  if (updatedImages.length !== service.images.length || !updatedImages.every((val, index) => val === service.images[index])) {
    updateData.images = updatedImages;
  }

  // ONLY UPDATE HIGHLIGHTS IF CHANGES WERE MADE
  if (updatedHighlights.length !== service.highlight.length || !updatedHighlights.every((val, index) => val === service.highlight[index])) {
    updateData.highlight = updatedHighlights;
  }

  // UPDATE THE SERVICE IN DATABASE
  const updatedService = await ServiceModel.findByIdAndUpdate(serviceId, updateData, { runValidators: true, new: true });

  // DELETE IMAGES FROM CLOUDINARY ASYNCHRONOUSLY IF NEEDED
  if (payload.deletedImages && payload.deletedImages.length > 0) {
    try {
      await Promise.all(
        payload.deletedImages.map((url) => deleteImageFromCLoudinary(url))
      );
    } catch (error) {
      console.log(`Cloudinary image deleting error`, error);
    }
  }

  return updatedService;
};


export const servicesLayer = {
  createService,
  deleteService,
  updateService
}



// UPDATE SERVICE CODE (FOR FUTURE UNEXPECTED BUGS FOR CURRENT ONE, I WILL REUSE IT)

// export const updateService = async (user: JwtPayload, serviceId: string, payload: IService) => {
//   // Check if the vendor is allowed to update
//   const service = await ServiceModel.findById(serviceId);
//   if (!service) {
//     throw new AppError(StatusCodes.NOT_FOUND, "Service not found");
//   }

//   if (service.user.toString() !== user.userId) {
//     throw new AppError(StatusCodes.UNAUTHORIZED, "You are not authorized to update this service");
//   }

//   // Ensure the service can only be updated within 30 minutes of creation
//   const serviceCreationTime = new Date(service.createdAt).getTime();
//   const currentTime = Date.now();
//   const timeDifference = currentTime - serviceCreationTime;
//   if (timeDifference > 30 * 60 * 1000) { // 30 minutes
//     throw new AppError(StatusCodes.FORBIDDEN, "You can only update the service within 30 minutes of creation");
//   }

//   // Initialize the array to hold the updated images
//   let updatedImages: string[] = [...service.images];

//   // ======= Image Update and Deletion Handling ==================
//   // 1. If there are new images, add them to the existing images
//   if (payload.images && payload.images.length > 0) {
//     updatedImages = [...new Set([...updatedImages, ...payload.images.map((url: string) => url.trim())])];
//   }

//   // 2. If images are marked for deletion, remove them from the existing images list
//   if (payload.deletedImages && payload.deletedImages.length > 0) {
//     updatedImages = updatedImages.filter((image: string) => !payload.deletedImages.includes(image));
//   }

//   // ======= Highlight Update Handling ============================
//   let updatedHighlights: string[] = [...service.highlight];  // start with existing highlights

//   // 1. If there are new highlights, add them to the existing ones
//   if (payload.highlight && payload.highlight.length > 0) {
//     // If highlight is a single string, make it an array
//     const newHighlights = Array.isArray(payload.highlight) 
//       ? payload.highlight.map((h: string) => h.trim())
//       : [(payload.highlight as string).trim()];  // Single value becomes array

//     updatedHighlights = [...new Set([...updatedHighlights, ...newHighlights])];
//   }

//   // If some highlights are marked for deletion, remove them from the existing highlights list
//   if (payload.deletedHighlights && payload.deletedHighlights.length > 0) {
//     updatedHighlights = updatedHighlights.filter((highlight: string) => !(payload.deletedHighlights as string[]).includes(highlight));
//   }

//   // ======= VALIDATE AND BUILD UPDATE PAYLOAD =======
//   const updateData: any = {};

//   if (payload.title) updateData.title = payload.title.trim();
//   if (payload.description) updateData.description = payload.description.trim();
//   if (payload.reguler_price !== undefined) updateData.reguler_price = payload.reguler_price;
//   if (payload.discount !== undefined) updateData.discount = payload.discount;

//   // Update the images if there were changes
//   if (updatedImages.length !== service.images.length || !updatedImages.every((val, index) => val === service.images[index])) {
//     updateData.images = updatedImages;
//   }

//   // Update the highlights if there were changes
//   if (updatedHighlights.length !== service.highlight.length || !updatedHighlights.every((val, index) => val === service.highlight[index])) {
//     updateData.highlight = updatedHighlights;
//   }

//   // ======= UPDATE THE SERVICE =======
//   const updatedService = await ServiceModel.findByIdAndUpdate(serviceId, updateData, { runValidators: true, new: true });


//   // ======= DELETE IMAGES FROM CLOUDINARY (ASYNCHRONOUSLY) =======
//   if (payload.deletedImages && payload.deletedImages.length > 0) {
//     try {
//       await Promise.all(
//         payload.deletedImages.map((url) => deleteImageFromCLoudinary(url)) // Assuming you have this function for deletion
//       );
//     } catch (error) {
//       console.log(`Cloudinary image deleting error`, error);
//     }
//   }

//   return updatedService;
// };
