/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-explicit-any */
import mongoose, { Types, PipelineStage } from 'mongoose';
import { JwtPayload } from 'jsonwebtoken';
import { Shop } from '../shop/shop.model';
import { Role } from '../user/user.interface';
import AppError from '../../errorHelpers/AppError';
import StatusCodes from 'http-status-codes';
import { deleteImageFromCLoudinary } from '../../config/cloudinary.config';
import { IDeal } from './deal.interface';
import { DealModel } from './deal.model';
import { Category } from '../categories/categories.model';
import { QueryBuilder } from '../../utils/QueryBuilder';
import { OutletModel } from '../outlet/outlet.model';
import { asynMultipleImageDelete } from '../../utils/singleImageDeleteAsync';
import { ShopApproval } from '../shop/shop.interface';

// 1. CREATE SERVICE
const createDealsService = async (params: {
  user: JwtPayload;
  payload: IDeal; // used for auto QR URL
}) => {
  const { user, payload } = params;
  const categoryId = new Types.ObjectId(payload.category);

  // CHECK USER IS VENDOR
  if (user.role !== Role.VENDOR) {
    if (payload.images) {
      await asynMultipleImageDelete(payload.images);
    }
    throw new AppError(StatusCodes.FORBIDDEN, 'Only vendor can create deals');
  }

  // IS SHOP EXIST BY USER ID
  const isShopExist = await Shop.findOne({ vendor: user.userId });

  // THROW ERROR IF SHOP IS NOT FOUND
  if (!isShopExist) {
    if (payload.images) {
      await asynMultipleImageDelete(payload.images);
    }

    throw new AppError(
      StatusCodes.NOT_FOUND,
      'No relatable shop found to upload this deal. Create a shop first.'
    );
  }

  // THROW ERROR IF SHOP ALREADY REJECTED
  if (isShopExist.shop_approval === ShopApproval.REJECTED) {
    if (payload.images) {
      await asynMultipleImageDelete(payload.images);
    }

    throw new AppError(StatusCodes.FORBIDDEN, 'Your shop was rejected');
  }

  // THROW ERROR IF SHOP IS NOT APPROVED YET
  if (isShopExist.shop_approval !== ShopApproval.APPROVED) {
    if (payload.images) {
      await asynMultipleImageDelete(payload.images);
    }

    throw new AppError(StatusCodes.BAD_REQUEST, 'Wait for shop approval');
  }

  // IS CATEGORY EXIST
  const isCategoryExist = await Category.findById(categoryId).lean();
  if (!isCategoryExist) {
    if (payload.images) {
      await asynMultipleImageDelete(payload.images);
    }

    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'Invalid category, category not found'
    );
  }

  // 2) VENDOR MUST OWN THE SHOP
  if (![Role.ADMIN, Role.VENDOR].includes(user.role)) {
    throw new AppError(StatusCodes.FORBIDDEN, 'Forbidden');
  }

  // NORMALIZE INPUTS O(n) BOUNDED
  const highlight = (payload.highlight || [])
    .map((h) => h.trim())
    .filter(Boolean);

  const images = (payload.images || []).map((u) => u.trim()).filter(Boolean);

  const available_in_outlet = payload.available_in_outlet?.map(
    (outletId) => new Types.ObjectId(outletId)
  );

  // 5) CREATE
  const finalPayload = {
    shop: isShopExist._id,
    user: new mongoose.Types.ObjectId(user.userId),
    category: isCategoryExist._id,

    title: payload.title,
    reguler_price: payload.reguler_price,
    discount: payload.discount,

    highlight,
    description: payload.description,
    images,
    available_in_outlet,
    coupon: payload.coupon,
  };
  const doc = await DealModel.create(finalPayload);

  return doc;
};

// 2. VIEW SERVICE
const getSingleDealsService = async (_dealId: string) => {
  const dealId = new mongoose.Types.ObjectId(_dealId);

  const addView = await DealModel.findByIdAndUpdate(
    { _id: dealId },
    { $inc: { total_views: 1 } }
  );

  if (!addView) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Deal not found');
  }

  const deal = await DealModel.aggregate([
    {
      $match: { _id: dealId },
    },

    {
      $lookup: {
        from: 'categories',
        localField: 'category',
        foreignField: '_id',
        as: 'category',
      },
    },

    {
      $unwind: '$category',
    },

    {
      $lookup: {
        from: 'shops',
        localField: 'shop',
        foreignField: '_id',
        as: 'shop',
      },
    },

    {
      $unwind: '$shop',
    },

    {
      $project: {
        'category.updatedAt': 0,
        'category.createdAt': 0,
        'shop.vendor': 0,
        'shop.description': 0,
        'shop.business_phone': 0,
        'shop.business_email': 0,
        'shop.business_logo': 0,
        'shop.updatedAt': 0,
        'shop.createdAt': 0,
        'shop.__v': 0,
      },
    },

    {
      $lookup: {
        from: 'outlets',
        localField: 'available_in_outlet',
        foreignField: '_id',
        as: 'available_outlet',
      },
    },

    {
      $project: {
        available_in_outlet: 0,
        activePromotion: 0,
        'available_outlet.shop': 0,
        'available_outlet.zip_code': 0,
        'available_outlet.createdAt': 0,
        'available_outlet.updatedAt': 0,
        'available_outlet.__v': 0,
      },
    },
  ]);

  const final_deal = deal[0];

  if (final_deal.length === 0) {
    throw new AppError(StatusCodes.NOT_FOUND, 'No deals found');
  }

  return final_deal;
};

// 3. DELETE SERVICE
const deleteDealsService = async (user: JwtPayload, serviceId: string) => {
  if (user.role !== Role.VENDOR) {
    throw new AppError(StatusCodes.FORBIDDEN, 'Only vendor can delete');
  }

  // Check is service exist
  const isServiceExist = await DealModel.findById(serviceId);
  if (!isServiceExist) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Service not found');
  }

  // 3. Check if the vendor owns the service by shop
  const isShopOwner = await Shop.exists({
    _id: isServiceExist.shop,
    vendor: user.userId,
  });
  if (!isShopOwner) {
    throw new AppError(
      StatusCodes.UNAUTHORIZED,
      'You are not authorized to delete this service'
    );
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
  setImmediate(async () => {
    try {
      const imageDeletionPromises = isServiceExist.images.map((image) =>
        deleteImageFromCLoudinary(image)
      );
      await Promise.all(imageDeletionPromises);
    } catch (error) {
      console.error('Error deleting images from Cloudinary:', error);
    }
  });

  return null;
};

// 4. UPDATE SERVICE
/**
 * @param user - Authenticated user (vendor)
 * @param serviceId - The service to update
 * @param payload - The updated data
 * @returns The updated service
 */

const updateDealsService = async (
  user: JwtPayload,
  dealId: string,
  payload: IDeal
) => {
  // CHECK IF THE SERVICE EXISTS
  const deal = await DealModel.findById(dealId);
  if (!deal) {
    // Delete iamge from cloudinary
    if (payload.images) {
      try {
        await Promise.all(
          payload.images.map((i) => deleteImageFromCLoudinary(i))
        );
      } catch (error: any) {
        console.log('Cloudinary image deletation error: ', error.message);
      }
    }

    // Throw Error
    throw new AppError(StatusCodes.NOT_FOUND, 'Service not found');
  }

  // CHECK IF THE USER IS AUTHORIZED TO UPDATE THE SERVICE
  if (deal.user.toString() !== user.userId) {
    // Delete iamge from cloudinary
    if (payload.images) {
      try {
        await Promise.all(
          payload.images.map((i: string) => deleteImageFromCLoudinary(i))
        );
      } catch (error: any) {
        console.log('Cloudinary image deletation error: ', error.message);
      }
    }

    // Throw Error
    throw new AppError(
      StatusCodes.UNAUTHORIZED,
      'You are not authorized to update this service'
    );
  }

  // ENSURE THE SERVICE CAN ONLY BE UPDATED WITHIN 30 MINUTES OF CREATION
  const serviceCreationTime = new Date(deal.createdAt as Date).getTime();
  const currentTime = Date.now();
  const timeDifference = currentTime - serviceCreationTime;
  if (timeDifference > 30 * 60 * 1000) {
    // 30 minutes
    // Delete iamge from cloudinary
    if (payload.images) {
      try {
        await Promise.all(
          payload.images.map((i) => deleteImageFromCLoudinary(i))
        );
      } catch (error: any) {
        console.log('Cloudinary image deletation error: ', error.message);
      }
    }
    throw new AppError(
      StatusCodes.FORBIDDEN,
      'You can only update the service within 30 minutes of creation'
    );
  }

  // INITIALIZE THE ARRAY TO HOLD THE UPDATED IMAGES
  let updatedImages: string[] = [...deal.images];

  // IMAGE UPDATE AND DELETION HANDLING
  if (payload.images && payload.images.length > 0) {
    updatedImages = [
      ...new Set([
        ...updatedImages,
        ...payload.images.map((url: string) => url.trim()),
      ]),
    ];
  }

  if (payload.deletedImages && payload.deletedImages.length > 0) {
    updatedImages = updatedImages.filter(
      (image: string) => !payload.deletedImages.includes(image)
    );
  }

  // HIGHLIGHT UPDATE HANDLING
  let updatedHighlights: string[] = [...deal.highlight]; // start with existing highlights

  if (payload.highlight && payload.highlight.length > 0) {
    const newHighlights = Array.isArray(payload.highlight)
      ? payload.highlight.map((h: string) => h.trim())
      : [(payload.highlight as string).trim()]; // Single value becomes array

    updatedHighlights = [...new Set([...updatedHighlights, ...newHighlights])];
  }

  if (payload.deletedHighlights && payload.deletedHighlights.length > 0) {
    updatedHighlights = updatedHighlights.filter(
      (highlight: string) =>
        !(payload.deletedHighlights as string[]).includes(highlight)
    );
  }

  // BUILD THE UPDATE PAYLOAD
  const updateData: any = {};

  if (payload.title) updateData.title = payload.title.trim();
  if (payload.description) updateData.description = payload.description.trim();
  if (payload.reguler_price !== undefined)
    updateData.reguler_price = payload.reguler_price;
  if (payload.discount !== undefined) updateData.discount = payload.discount;

  // ONLY UPDATE IMAGES IF CHANGES WERE MADE
  if (
    updatedImages.length !== deal.images.length ||
    !updatedImages.every((val, index) => val === deal.images[index])
  ) {
    updateData.images = updatedImages;
  }

  // ONLY UPDATE HIGHLIGHTS IF CHANGES WERE MADE
  if (
    updatedHighlights.length !== deal.highlight.length ||
    !updatedHighlights.every((val, index) => val === deal.highlight[index])
  ) {
    updateData.highlight = updatedHighlights;
  }

  // UPDATE THE SERVICE IN DATABASE
  const updatedService = await DealModel.findByIdAndUpdate(dealId, updateData, {
    runValidators: true,
    new: true,
  });

  // DELETE IMAGES FROM CLOUDINARY ASYNCHRONOUSLY IF NEEDED
  if (payload.deletedImages && payload.deletedImages.length > 0) {
    try {
      await Promise.all(
        payload.deletedImages.map((url: string) =>
          deleteImageFromCLoudinary(url)
        )
      );
    } catch (error) {
      console.log(`Cloudinary image deleting error`, error);
    }
  }

  return updatedService;
};

// 5. GET MY SERVICE
const getMyDealsService = async (
  userId: string,
  query: Record<string, string>
) => {
  const queryBuilder = new QueryBuilder(
    DealModel.find({ user: userId }),
    query
  );
  const deals = await queryBuilder
    .filter()
    .select()
    .sort()
    .join()
    .paginate()
    .build();
  const meta = await queryBuilder.getMeta();
  return {
    meta,
    deals,
  };
};

// 6. GET NEAREST DEALS
const getNearestDealsService = async (
  userLng: number,
  userLat: number,
  query: Record<string, string>
) => {
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 10;
  const skip = (page - 1) * limit;

  const pipeline: PipelineStage[] = [
    // STEP 1: GEO SEARCH (MUST BE FIRST STAGE)
    {
      $geoNear: {
        near: {
          type: 'Point',
          coordinates: [userLng, userLat],
        },
        distanceField: 'distance',
        spherical: true,
        query: { isActive: true },
        // maxDistance: 10000, // optional 10km radius
      },
    },

    // STEP 2:  LOOKUP DEALS AVAILABLE IN OUTLET
    {
      $lookup: {
        from: 'deals',
        localField: '_id',
        foreignField: 'available_in_outlet',
        as: 'deals',
      },
    },

    { $unwind: '$deals' },

    // STEP 3: FILTER ONLY ACTIVE PROMOTED DEALS
    {
      $match: {
        'deals.isPromoted': true,
        'deals.promotedUntil': { $gt: new Date() },
      },
    },

    // STEP 4: ATTACH DISTANCE + NEAREST_OUTLET ID
    {
      $addFields: {
        'deals.distance': '$distance',
        'deals.nearest_outlet': '$_id',
      },
    },

    { $replaceRoot: { newRoot: '$deals' } },

    // STEP 5: SORT NEAREST FIRST
    { $sort: { distance: 1 } },

    // STEP 6: REMOVE DUPLICATES (IF DEAL AVAILABLE IN MULTIPLE OUTLETS)
    {
      $group: {
        _id: '$_id',
        doc: { $first: '$$ROOT' }, // nearest one preserved
      },
    },

    { $replaceRoot: { newRoot: '$doc' } },

    // STEP 7: SORT AGAIN AFTER GROUPING
    { $sort: { distance: 1 } },

    // STEP 8: PAGINATION
    { $skip: skip },
    { $limit: limit },

    // STEP 9: LOOKUP MINIMAL SHOP INFO
    {
      $lookup: {
        from: 'shops',
        localField: 'shop',
        foreignField: '_id',
        as: 'shop',
        pipeline: [
          {
            $project: {
              business_name: 1,
              business_logo: 1,
            },
          },
        ],
      },
    },

    { $unwind: '$shop' },

    // STEP 10: FINAL PROJECTION
    {
      $project: {
        title: 1,
        reguler_price: 1,
        discount: 1,
        images: { $slice: ['$images', 1] },
        distance: 1,
        nearest_outlet: 1,
        shop: 1,
        isPromoted: 1,
        promotedUntil: 1,
      },
    },
  ];

  // FETCH DEALS
  const nearestDealsPromise = OutletModel.aggregate(pipeline);

  // TOTAL PROMOTED DEALS COUNT
  const totalPromotedDocPromise = DealModel.countDocuments({
    isPromoted: true,
    promotedUntil: { $gte: new Date() },
  });

  // RESOLVE ALL PROMISE PARALALLY
  const [nearestDeals, totalPromotedDoc] = await Promise.all([
    nearestDealsPromise,
    totalPromotedDocPromise,
  ]);

  // CREATE META DATA
  const meta = {
    page,
    limit,
    total: totalPromotedDoc,
    totalPages: Math.ceil(totalPromotedDoc / limit),
  };

  return {
    meta,
    deals: nearestDeals,
  };
};

// 7. GET ALL DEALS
const getAllDealsService = async (
  userLng: number,
  userLat: number,
  query: Record<string, string>
) => {
  const searchTerm = query.searchTerm || '';
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 20;
  const skip = (page - 1) * limit;

  // DEALS QUERY
  const dealsPromise = OutletModel.aggregate([
    // STAGE 1: SEARCH NEAREST DEALS
    {
      $geoNear: {
        near: {
          type: 'Point',
          coordinates: [Number(userLng), Number(userLat)],
        },
        distanceField: 'distance',
        spherical: true,
        key: 'location',
        query: { isActive: true },
      },
    },

    // STAGE 2: JOIN WITH DEALS
    {
      $lookup: {
        from: 'deals',
        localField: '_id',
        foreignField: 'available_in_outlet',
        as: 'deal',
      },
    },

    {
      $unwind: '$deal',
    },

    // STAGE 3: SEARCH WITH SEARCH KEYWORD
    {
      $match: {
        $or: [
          { 'deal.title': { $regex: searchTerm, $options: 'i' } },
          { 'deal.description': { $regex: searchTerm, $options: 'i' } },
          { zip_code: { $regex: searchTerm, $options: 'i' } },
        ],
      },
    },

    {
      $sort: { distance: 1 },
    },

    // STAGE 4: JOIN WITH SHOP FOR SHOP DETAILS
    {
      $lookup: {
        from: 'shops',
        localField: 'shop',
        foreignField: '_id',
        as: 'shop',
      },
    },

    {
      $unwind: '$shop',
    },

    // STAGE 5: FETCH ONLY PROMOTED DEALS
    {
      $match: {
        $and: [
          { 'deal.isPromoted': true },
          { 'deal.promotedUntil': { $gte: new Date() } },
        ],
      },
    },

    // STAGE 6: FINAL PROJECTION
    {
      $project: {
        'shop.business_logo': 1,
        'shop.business_name': 1,
        distance: 1,
        'deal.title': 1,
        'deal.reguler_price': 1,
        'deal.discount': 1,
        'deal.isPromoted': 1,
        'deal.promotedUntil': 1,
        'deal.images': 1,
      },
    },

    // PAGINATE
    {
      $skip: skip,
    },

    {
      $limit: limit,
    },
  ]);

  // TOTAL PROMOTED DEALS COUNT
  const totalPromotedDocPromise = DealModel.countDocuments({
    isPromoted: true,
    promotedUntil: { $gte: new Date() },
  });

  // RESOLVE ALL PROMISE HERE
  const [deals, totalPromotedDoc] = await Promise.all([
    dealsPromise,
    totalPromotedDocPromise,
  ]);

  // CREATE META
  const meta = {
    page,
    limit,
    total: totalPromotedDoc,
    totalPages: Math.ceil(totalPromotedDoc / limit),
  };

  // RETURN FINAL OUTPUT
  return { meta, deals };
};

export const dealsServices = {
  createDealsService,
  deleteDealsService,
  updateDealsService,
  getSingleDealsService,
  getMyDealsService,
  getNearestDealsService,
  getAllDealsService,
};
