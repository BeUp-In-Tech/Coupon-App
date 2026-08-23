/* eslint-disable @typescript-eslint/no-explicit-any */
import mongoose, { Types, PipelineStage } from 'mongoose';
import { JwtPayload } from 'jsonwebtoken';
import { Shop } from '../../shop/shop.model';
import { Role } from '../../user/user.interface';
import AppError from '../../../errorHelpers/AppError';
import StatusCodes from 'http-status-codes';
import { IDeal, IQuery } from './deal.interface';
import { DealModel } from './deal.model';
import { Category } from '../../categories/categories.model';
import { QueryBuilder } from '../../../utils/QueryBuilder';
import { Location } from '../../location/location.model';
import { addImageDeleteJob } from '../../../utils/imageDeleteJobAdd';
import { ShopApproval } from '../../shop/shop.interface';
import { redisClient } from '../../../config/redis.config';
import { Views_Impressions } from '../../views_impression/vi.model';
import { invalidateAllMachineryCache } from '../../../utils/deleteCachedData';
import crypto from 'crypto';
import { sortObject } from '../../../utils/sortObject';
import { dealLogger, LoggerModule } from '../../../utils/logger/logger.child';
import {
  CategoryDealsByLocationQuery,
  SearchDealsByLocationQuery,
} from '../deal.validate';
import {
  buildLocationDealsCacheKey,
  buildLocationLabel,
  getDealListFacet,
  getDealLookupStage,
  getNationwideDealsUnionStage,
  recordDealImpressions,
  resolveSelectedLocationDocs,
  visibleDealFilter,
} from './deal.helper';
import { DealDiscountType } from './deal.constant';

// 1. CREATE DEAL
const createDealsService = async (params: {
  user: JwtPayload;
  payload: IDeal; // used for auto QR URL
}) => {
  const { user, payload } = params;
  const categoryId = new Types.ObjectId(payload.category);

  // CHECK USER IS VENDOR
  if (user.role !== Role.VENDOR) {
    if (payload.images) {
      await addImageDeleteJob(payload.images);
    }
    throw new AppError(
      StatusCodes.FORBIDDEN,
      'Only vendor can create deals',
      LoggerModule.DEAL
    );
  }

  // IS SHOP EXIST BY USER ID
  const isShopExist = await Shop.findOne({ vendor: user.userId });

  // THROW ERROR IF SHOP IS NOT FOUND
  if (!isShopExist) {
    if (payload.images) {
      await addImageDeleteJob(payload.images);
    }

    if (payload.coupon_option?.qr) {
      await addImageDeleteJob([payload.coupon_option.qr]);
    }

    if (payload.coupon_option?.upc) {
      await addImageDeleteJob([payload.coupon_option.upc]);
    }

    throw new AppError(
      StatusCodes.NOT_FOUND,
      'No relatable shop found to upload this deal. Create a shop first.',
      LoggerModule.DEAL
    );
  }

  if (
    (payload.coupon_required ?? true) &&
    !payload.coupon &&
    !payload.coupon_option?.qr &&
    !payload.coupon_option?.upc
  ) {
    if (payload.images) {
      await addImageDeleteJob(payload.images);
    }

    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'At least one of these required: Coupon code, Qr and Bar code',
      LoggerModule.DEAL
    );
  }

  // THROW ERROR IF SHOP ALREADY REJECTED
  if (isShopExist.shop_approval === ShopApproval.REJECTED) {
    if (payload.images) {
      await addImageDeleteJob(payload.images);
    }

    if (payload.coupon_option?.qr) {
      await addImageDeleteJob([payload.coupon_option.qr]);
    }

    if (payload.coupon_option?.upc) {
      await addImageDeleteJob([payload.coupon_option.upc]);
    }

    throw new AppError(
      StatusCodes.FORBIDDEN,
      'Your shop was rejected',
      LoggerModule.DEAL
    );
  }

  // THROW ERROR IF SHOP IS NOT APPROVED YET
  if (isShopExist.shop_approval !== ShopApproval.APPROVED) {
    if (payload.images) {
      await addImageDeleteJob(payload.images);
    }

    if (payload.coupon_option?.qr) {
      await addImageDeleteJob([payload.coupon_option.qr]);
    }

    if (payload.coupon_option?.upc) {
      await addImageDeleteJob([payload.coupon_option.upc]);
    }

    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'Wait for shop approval',
      LoggerModule.DEAL
    );
  }

  // IS CATEGORY EXIST
  const isCategoryExist = await Category.findById(categoryId).lean();
  if (!isCategoryExist) {
    if (payload.images) {
      await addImageDeleteJob(payload.images);
    }

    if (payload.coupon_option?.qr) {
      await addImageDeleteJob([payload.coupon_option.qr]);
    }

    if (payload.coupon_option?.upc) {
      await addImageDeleteJob([payload.coupon_option.upc]);
    }

    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'Invalid category, category not found',
      LoggerModule.DEAL
    );
  }

  // 2) VENDOR MUST OWN THE SHOP
  if (![Role.ADMIN, Role.VENDOR].includes(user.role)) {
    throw new AppError(StatusCodes.FORBIDDEN, 'Forbidden', LoggerModule.DEAL);
  }

  const discountType =
    payload.discount_type ?? DealDiscountType.PERCENT_OFF_PRICE;
  const resolvedDiscount = payload.discount ?? 0;
  if (
    [
      DealDiscountType.PERCENT_OFF_PRICE,
      DealDiscountType.PERCENT_OFF_TOTAL,
    ].includes(discountType) &&
    (resolvedDiscount < 1 || resolvedDiscount > 100)
  ) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'Percentage discount must be between 1 and 100',
      LoggerModule.DEAL
    );
  }

  if (
    [DealDiscountType.FIXED_PRICE].includes(discountType) &&
    resolvedDiscount !== 0
  ) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'Discount must be 0 for a fixed-price deal',
      LoggerModule.DEAL
    );
  }

  if (
    discountType === DealDiscountType.PERCENT_OFF_TOTAL &&
    payload.regular_price !== undefined &&
    payload.regular_price !== 0
  ) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'Regular price is not required for percentage-off-total deals',
      LoggerModule.DEAL
    );
  }

  if (discountType === DealDiscountType.CUSTOM_DISCOUNT) {
    if (!payload.custom_discount || !payload.custom_discount.trim()) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        'custom_discount is required for custom discount deals',
        LoggerModule.DEAL
      );
    }
  }

  if (
    (payload.coupon_required ?? true) &&
    !payload.coupon &&
    !payload.coupon_option?.qr &&
    !payload.coupon_option?.upc
  ) {
    if (payload.images) {
      await addImageDeleteJob(payload.images);
    }

    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'At least one of these required: Coupon code, Qr and Bar code',
      LoggerModule.DEAL
    );
  }

  if (
    payload.coupon_required === false &&
    (payload.coupon || payload.coupon_option?.qr || payload.coupon_option?.upc)
  ) {
    if (payload.images) {
      await addImageDeleteJob(payload.images);
    }

    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'Coupon values are not allowed when coupon is not required',
      LoggerModule.DEAL
    );
  }

  // NORMALIZE INPUTS O(n) BOUNDED
  const highlight = (payload.highlight || [])
    .map((h) => h.trim())
    .filter(Boolean);

  const images = (payload.images || []).map((u) => u.trim()).filter(Boolean);

  const available_in_location =
    payload.available_in_location?.map(
      (outletId) => new Types.ObjectId(outletId)
    ) ?? [];

  if (!payload.nationwide && available_in_location.length === 0) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'At least one location is required when nationwide is false',
      LoggerModule.DEAL
    );
  }

  // 5) CREATE
  const finalPayload = {
    shop: isShopExist._id,
    user: new mongoose.Types.ObjectId(user.userId),
    category: isCategoryExist._id,

    title: payload.title,
    regular_price: payload.regular_price ?? 0,
    discount: payload.discount,
    discount_type: discountType,
    custom_discount:
      discountType === DealDiscountType.CUSTOM_DISCOUNT
        ? payload.custom_discount
        : undefined,

    highlight,
    tags: payload.tags,
    description: payload.description,
    images,
    nationwide: payload.nationwide ?? false,
    available_in_location,
    coupon: payload.coupon,
    coupon_required: payload.coupon_required ?? true,
    coupon_option: payload.coupon_option,
  };
  const doc = await DealModel.create(finalPayload);
  const populatedDoc = await doc.populate([
    { path: 'shop', select: 'business_name business_logo shop_approval website' },
    { path: 'category', select: 'category_name category_image isDeleted' },
    { path: 'available_in_location' }
  ]);

  // REMOVE CACHE (DASHBOARD API CACHE)
  await redisClient.del('deals_by_category_stats');
  await invalidateAllMachineryCache('location_deals:*');
  await invalidateAllMachineryCache('recent_deals:*');
  await invalidateAllMachineryCache('deals_stats:*');
  await invalidateAllMachineryCache(`my_deals-userId:${user.userId}:*`);

  const result = populatedDoc.toObject() as any;
  result.available_location = result.available_in_location;
  return result;
};

// 2. VIEW DEAL
const getSingleDealsService = async (
  _dealId: string,
  lat: number,
  lng: number
) => {
  const dealId = new mongoose.Types.ObjectId(_dealId);

  // IF DEAL NOT FOUND
  const deal = (await DealModel.findOne({
    _id: dealId,
    ...visibleDealFilter,
  })
    .populate({
      path: 'shop',
      select: 'business_name business_logo shop_approval website',
    })
    .populate({
      path: 'category',
      select: 'category_name category_image isDeleted',
    })
    .populate('available_in_location')
    .lean()) as IDeal | null;

  if (!deal) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      'Ads not found',
      LoggerModule.DEAL
    );
  }

  // IF THE DEAL IS NATIONWIDE, RETURN THIS RESPONSE
  if (deal.nationwide || !lat || !lng) {
    // ADD VIEW
    Views_Impressions.create({
      deal: dealId,
      type: 'view',
    });

    (deal as any).available_location = deal.available_in_location;
    return deal;
  }

  if ((deal?.available_in_location?.length ?? 0) < 1) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      'No location found or not a nationwide ads. To get this ads please add a location or make nationwide available'
    );
  }

  // ADD VIEW
  Views_Impressions.create({
    deal: dealId,
    type: 'view',
  });

  // IF THE DEAL IS NOT NATIONWIDE, RETURN THIS RESPONSE
  const deals = await Location.aggregate([
    // FIND OUTLETS NEAR USER
    {
      $geoNear: {
        near: {
          type: 'Point',
          coordinates: [lng, lat],
        },
        distanceField: 'distance',
        spherical: true,
      },
    },

    // FIND DEAL AVAILABLE IN THIS OUTLET
    {
      $lookup: {
        from: 'deals',
        localField: '_id',
        foreignField: 'available_in_location',
        as: 'deal',
      },
    },

    { $unwind: '$deal' },

    // MATCH SPECIFIC DEAL
    {
      $match: {
        'deal._id': dealId,
        'deal.isBanned': { $ne: true },
        'deal.deal_status': { $ne: 'BANNED' },
      },
    },

    // ATTACH DISTANCE INTO OUTLET
    {
      $addFields: {
        'deal.available_location': {
          _id: '$_id',
          name: '$name',
          address: '$address',
          location: '$location',
          distance: '$distance',
        },
      },
    },

    // GROUP ALL OUTLETS FOR THIS DEAL
    {
      $group: {
        _id: '$deal._id',
        deal: { $first: '$deal' },
        outlets: { $push: '$deal.available_location' },
      },
    },

    {
      $addFields: {
        'deal.available_location': '$outlets',
        'deal.available_in_location': '$outlets',
      },
    },

    {
      $replaceRoot: {
        newRoot: '$deal',
      },
    },

    // LOOKUP CATEGORY
    {
      $lookup: {
        from: 'categories',
        localField: 'category',
        foreignField: '_id',
        as: 'category',
      },
    },
    { $unwind: '$category' },

    // LOOKUP SHOP
    {
      $lookup: {
        from: 'shops',
        localField: 'shop',
        foreignField: '_id',
        as: 'shop',
      },
    },
    { $unwind: '$shop' },

    // CLEAN RESPONSE
    {
      $project: {
        activePromotion: 0,

        'category.createdAt': 0,
        'category.updatedAt': 0,

        'shop.vendor': 0,
        'shop.description': 0,
        'shop.business_phone': 0,
        'shop.business_email': 0,
        'shop.updatedAt': 0,
        'shop.createdAt': 0,
        'shop.__v': 0,
      },
    },
  ]);

  const final_deal = deals[0];

  if (!final_deal) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      'Ads not found',
      LoggerModule.DEAL
    );
  }

  return final_deal;
};

// 3. DELETE DEAL
const deleteDealsService = async (user: JwtPayload, serviceId: string) => {
  if (user.role !== Role.VENDOR) {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      'Only vendor can delete',
      LoggerModule.DEAL
    );
  }

  // Check is service exist
  const isServiceExist = await DealModel.findById(serviceId);
  if (!isServiceExist) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      'Service not found',
      LoggerModule.DEAL
    );
  }

  // 3. Check if the vendor owns the service by shop
  const isShopOwner = await Shop.exists({
    _id: isServiceExist.shop,
    vendor: user.userId,
  });
  if (!isShopOwner) {
    throw new AppError(
      StatusCodes.UNAUTHORIZED,
      'You are not authorized to delete this service',
      LoggerModule.DEAL
    );
  }

  await DealModel.deleteOne({ _id: serviceId });

  // 6. Delete images asynchronously using promises
  setImmediate(async () => {
    try {
      await addImageDeleteJob(isServiceExist.images);
    } catch (error) {
      dealLogger.error({ error }, 'Error deleting images from Cloudinary');
    }
  });

  setImmediate(async () => {
    await invalidateAllMachineryCache('machinery:*');
    await invalidateAllMachineryCache('location_deals:*');
    await invalidateAllMachineryCache('recent_deals:*');
    await invalidateAllMachineryCache('deals_stats:*');
    await invalidateAllMachineryCache(`my_deals-userId:${user.userId}:*`);
  });

  return null;
};

// 4. UPDATE DEAL
const validateV2PricingState = (params: {
  discountType: DealDiscountType;
  regularPrice: number;
  discount: number;
  customDiscount?: string;
}) => {
  const { discountType, regularPrice, discount, customDiscount } = params;

  if (
    [
      DealDiscountType.PERCENT_OFF_PRICE,
      DealDiscountType.PERCENT_OFF_TOTAL,
    ].includes(discountType) &&
    (discount < 1 || discount > 100)
  ) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'Percentage discount must be between 1 and 100',
      LoggerModule.DEAL
    );
  }

  if (
    discountType === DealDiscountType.PERCENT_OFF_TOTAL &&
    regularPrice !== 0
  ) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'Regular price is not required for percentage-off-total deals',
      LoggerModule.DEAL
    );
  }

  if (discountType === DealDiscountType.CUSTOM_DISCOUNT) {
    if (!customDiscount || !customDiscount.trim()) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        'custom_discount is required for custom discount deals',
        LoggerModule.DEAL
      );
    }
  }
};

const updateDealsService = async (
  user: JwtPayload,
  dealId: string,
  payload: IDeal,
  options: { v2?: boolean } = {}
) => {
  // CHECK IF THE DEAL EXISTS
  const deal = await DealModel.findById(dealId);

  // Delete image from cloudinary
  if (!deal) {
    if (payload.images) {
      try {
        await addImageDeleteJob(payload.images);
        if (payload.coupon_option?.qr) {
          await addImageDeleteJob([payload.coupon_option.qr]);
        }
        if (payload.coupon_option?.upc) {
          await addImageDeleteJob([payload.coupon_option.upc]);
        }
      } catch (error: any) {
        dealLogger.error({ error }, 'Cloudinary image deletion error');
      }
    }

    // Throw Error
    throw new AppError(
      StatusCodes.NOT_FOUND,
      'Deal not found',
      LoggerModule.DEAL
    );
  }

  // CHECK IF THE USER IS AUTHORIZED TO UPDATE THE SERVICE
  if (deal.user.toString() !== user.userId) {
    // Delete image from cloudinary
    if (payload.images) {
      try {
        await addImageDeleteJob(payload.images);

        if (payload.coupon_option?.qr) {
          await addImageDeleteJob([payload.coupon_option.qr]);
        }

        if (payload.coupon_option?.upc) {
          await addImageDeleteJob([payload.coupon_option.upc]);
        }
      } catch (error: any) {
        dealLogger.error({ error }, 'Cloudinary image deletion error');
      }
    }

    // Throw Error
    throw new AppError(
      StatusCodes.UNAUTHORIZED,
      'You are not authorized to update this service',
      LoggerModule.DEAL
    );
  }

  const fieldsToUnset: Record<string, 1> = {};
  let shouldClearCouponValues = false;

  if (options.v2) {
    const discountType =
      payload.discount_type ??
      deal.discount_type ??
      DealDiscountType.PERCENT_OFF_PRICE;
    const regularPrice = payload.regular_price ?? deal.regular_price;
    const discount = payload.discount ?? deal.discount;
    validateV2PricingState({
      discountType,
      regularPrice,
      discount,
      customDiscount: payload.custom_discount ?? deal.custom_discount,
    });

    if (
      payload.discount_type !== undefined &&
      discountType !== DealDiscountType.CUSTOM_DISCOUNT
    ) {
      fieldsToUnset.custom_discount = 1;
    }

    const couponRequired =
      payload.coupon_required ??
      deal.coupon_required ??
      Boolean(deal.coupon || deal.coupon_option?.qr || deal.coupon_option?.upc);

    if (couponRequired) {
      const coupon = payload.coupon ?? deal.coupon;
      const qr = payload.coupon_option?.qr ?? deal.coupon_option?.qr;
      const upc = payload.coupon_option?.upc ?? deal.coupon_option?.upc;

      if (!coupon && !qr && !upc) {
        throw new AppError(
          StatusCodes.BAD_REQUEST,
          'At least one coupon code, QR, or UPC is required',
          LoggerModule.DEAL
        );
      }
    } else {
      shouldClearCouponValues = true;
      fieldsToUnset.coupon = 1;
      fieldsToUnset['coupon_option.qr'] = 1;
      fieldsToUnset['coupon_option.upc'] = 1;
    }
  }

  // INITIALIZE THE ARRAY TO HOLD THE UPDATED IMAGES
  let updatedImages: string[] = [...deal.images];

  // IMAGE UPDATE AND DELETION HANDLING
  if (payload.images && payload.images.length > 0) {
    updatedImages = [
      ...new Set([
        ...updatedImages,
        ...payload.images.map((url: string) => url),
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

  // TAGS UPDATE HANDLING
  let updatedTags: string[] = [...deal.tags]; // start with existing tags

  if (payload.tags && payload.tags.length > 0) {
    const newTags = Array.isArray(payload.tags)
      ? payload.tags.map((t: string) => t.trim())
      : [(payload.tags as string).trim()]; // Single value becomes array

    updatedTags = [...new Set([...updatedTags, ...newTags])];
  }

  if (payload.deletedTags && payload.deletedTags.length > 0) {
    updatedTags = updatedTags.filter(
      (tag: string) => !(payload.deletedTags as string[]).includes(tag)
    );
  }

  // BUILD THE UPDATE PAYLOAD
  const updateData: any = {};

  if (payload.title) updateData.title = payload.title.trim();
  if (payload.description) updateData.description = payload.description.trim();
  if (payload.regular_price !== undefined)
    updateData.regular_price = payload.regular_price;
  if (payload.discount !== undefined) updateData.discount = payload.discount;
  if (payload.custom_discount !== undefined)
    updateData.custom_discount = payload.custom_discount;
  if (options.v2 && payload.discount_type !== undefined)
    updateData.discount_type = payload.discount_type;

  if (
    options.v2 &&
    updateData.discount_type === DealDiscountType.PERCENT_OFF_TOTAL
  ) {
    updateData.regular_price = 0;
  }

  const nextNationwide = payload.nationwide ?? deal.nationwide ?? false;
  const nextLocationIds =
    payload.available_in_location !== undefined
      ? payload.available_in_location.map(
          (locationId) => new Types.ObjectId(locationId)
        )
      : (deal.available_in_location ?? []);

  if (!nextNationwide && nextLocationIds.length === 0) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'At least one location is required when nationwide is false',
      LoggerModule.DEAL
    );
  }

  if (payload.nationwide !== undefined) {
    updateData.nationwide = payload.nationwide;
  }

  if (payload.available_in_location !== undefined) {
    updateData.available_in_location = nextLocationIds;
  }

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

  // ONLY UPDATE TAGS IF CHANGES WERE MADE
  if (
    updatedTags.length !== deal.tags.length ||
    !updatedTags.every((val, index) => val === deal.tags[index])
  ) {
    updateData.tags = updatedTags;
  }

  // UPDATE COUPON CODE
  if (!shouldClearCouponValues && payload?.coupon) {
    updateData.coupon = payload.coupon;
  }
  if (options.v2 && payload.coupon_required !== undefined) {
    updateData.coupon_required = payload.coupon_required;
  }

  // ONLY UPDATE QR CODE IF CHANGES WERE MADE
  if (!shouldClearCouponValues && payload?.coupon_option?.qr) {
    updateData.coupon_option = updateData.coupon_option || {
      upc: deal.coupon_option?.upc,
    };
    updateData.coupon_option.qr = payload?.coupon_option?.qr;
  }

  // ONLY UPDATE UPC
  if (!shouldClearCouponValues && payload?.coupon_option?.upc) {
    updateData.coupon_option = updateData.coupon_option || {
      qr: deal.coupon_option?.qr,
    };
    updateData.coupon_option.upc = payload?.coupon_option?.upc;
  }

  // UPDATE THE DEAL IN DATABASE
  const updateOperation =
    options.v2 && Object.keys(fieldsToUnset).length
      ? { $set: updateData, $unset: fieldsToUnset }
      : updateData;

  const updateDeal = await DealModel.findByIdAndUpdate(
    dealId,
    updateOperation,
    {
      runValidators: true,
      new: true,
    }
  );

  // DELETE IMAGES FROM CLOUDINARY ASYNCHRONOUSLY
  setImmediate(async () => {
    // DEAL IMAGE DELETION
    if (payload.deletedImages && payload.deletedImages.length > 0) {
      try {
        await addImageDeleteJob(payload.deletedImages);
      } catch (error: any) {
        dealLogger.error({ error }, `Cloudinary image deleting error`);
      }
    }

    // QR IMAGE DELETION
    if (!shouldClearCouponValues && payload?.coupon_option?.qr) {
      try {
        await addImageDeleteJob([deal.coupon_option.qr as string]);
      } catch (error: any) {
        dealLogger.error({ error }, `Cloudinary image deleting error`);
      }
    }

    // UPC IMAGE DELETION
    if (!shouldClearCouponValues && payload?.coupon_option?.upc) {
      try {
        await addImageDeleteJob([deal.coupon_option.upc as string]);
      } catch (error: any) {
        dealLogger.error({ error }, `Cloudinary image deleting error`);
      }
    }

    if (options.v2 && shouldClearCouponValues) {
      const redemptionImages = [
        deal.coupon_option?.qr,
        deal.coupon_option?.upc,
        payload.coupon_option?.qr,
        payload.coupon_option?.upc,
      ].filter((url): url is string => Boolean(url));

      if (redemptionImages.length) {
        try {
          await addImageDeleteJob(redemptionImages);
        } catch (error: any) {
          dealLogger.error({ error }, 'Old coupon image deletion error');
        }
      }
    }
  });

  // REMOVE REDIS CACHE KEY
  setImmediate(async () => {
    await redisClient.del(`shop:${updateDeal?.shop.toString()}`);
    await invalidateAllMachineryCache('machinery:*');
    await invalidateAllMachineryCache('location_deals:*');
    await invalidateAllMachineryCache('recent_deals:*');
    await invalidateAllMachineryCache('deals_stats:*');
    await invalidateAllMachineryCache(`my_deals-userId:${user.userId}:*`);
  });

  // RETURN DATA
  if (updateDeal) {
    const populatedUpdateDeal = await updateDeal.populate([
      { path: 'shop', select: 'business_name business_logo shop_approval website' },
      { path: 'category', select: 'category_name category_image isDeleted' },
      { path: 'available_in_location' }
    ]);
    const result = populatedUpdateDeal.toObject() as any;
    result.available_location = result.available_in_location;
    return result;
  }
  return updateDeal;
};

// 5. GET MY DEALS
const getMyDealsService = async (
  userId: string,
  query: Record<string, string>
) => {
  const page = query.page ? Number(query.page) : 1;
  const limit = query.limit ? Number(query.limit) : 10;
  const queryWithModerationFields = {
    ...query,
    ...(query.fields
      ? {
          fields: [
            ...new Set([
              ...query.fields
                .split(',')
                .map((field) => field.trim())
                .filter(Boolean),
              'isBanned',
              'ban_reason',
            ]),
          ].join(','),
        }
      : {}),
  };

  // DYNAMIC FILTERING
  const filter: Record<string, any> = { user: userId };
  switch (query.deal_filter) {
    case 'promoted':
      filter.isPromoted = true;
      filter.promotedUntil = { $gte: new Date() };
      break;
    case 'expired':
      filter.promotedUntil = { $lt: new Date() };
      filter.isPromoted = false;
      filter.activePromotion = { $ne: null };
      break;
    case 'new':
      filter.activePromotion = null;
      break;
    default:
      break;
  }

  // QUERY WITH DEFAULTS
  const queryWithDefaults = { page, limit, ...queryWithModerationFields };

  // SORT OBJECT
  const sortedParams = sortObject(queryWithDefaults);

  // CREATE A SHORT HASH
  const queryHash = crypto
    .createHash('md5')
    .update(JSON.stringify(sortedParams))
    .digest('hex');

  // GENERATE HASH KEY
  const cacheKey = `my_deals-userId:${userId}:${queryHash}`;

  // CHECK CACHE
  const getCachedData = await redisClient.get(cacheKey);
  if (getCachedData) {
    return JSON.parse(getCachedData);
  }

  // QUERY BUILDER
  const queryBuilder = new QueryBuilder(
    DealModel.find(filter),
    queryWithModerationFields
  );
  const deals = await queryBuilder
    .filter()
    .select()
    .search(['title', 'description'])
    .select()
    .sort()
    .join()
    .paginate()
    .build();

  // CALCULATE META INFO
  const totalDocuments = await DealModel.countDocuments(filter);
  const meta = {
    page,
    limit,
    total: totalDocuments,
    totalPages: Math.ceil(totalDocuments / limit),
  };

  const data = {
    meta,
    deals,
  };

  // SAVE TO REDIS
  await redisClient.set(cacheKey, JSON.stringify(data), {
    EX: 600, // 10 min
  });

  // RETURN DATA
  return data;
};

// 6. GET DEALS BY CATEGORY
const getDealsByCategoryService = async (
  categoryId: string,
  query: CategoryDealsByLocationQuery
) => {
  if (!mongoose.Types.ObjectId.isValid(categoryId)) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'Valid categoryId is required',
      LoggerModule.DEAL
    );
  }

  const categoryObjectId = new mongoose.Types.ObjectId(categoryId);
  const categoryMatch = { category: categoryObjectId };

  if (query.locationMode === 'CURRENT_LOCATION') {
    return searchCurrentLocationDeals(query, categoryMatch);
  }

  return searchSelectedLocationDeals(query, {
    extraMatch: categoryMatch,
    cacheResult: false,
  });
};

// 7. GET ALL DEALS
const getAllDealsService = async (query: IQuery) => {
  const searchTerm = query.searchTerm || '';
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 20;
  const skip = (page - 1) * limit;
  const now = new Date();

  const match = {
    isPromoted: true,
    promotedUntil: { $gte: now },
    ...visibleDealFilter,
    ...(query.category && { category: new Types.ObjectId(query.category) }),
  };

  const [result] = await DealModel.aggregate([
    { $match: match },
    {
      $lookup: {
        from: 'shops',
        localField: 'shop',
        foreignField: '_id',
        as: 'shop',
      },
    },
    { $unwind: '$shop' },
    {
      $match: {
        $or: [
          { 'shop.business_name': { $regex: searchTerm, $options: 'i' } },
          { title: { $regex: searchTerm, $options: 'i' } },
          { description: { $regex: searchTerm, $options: 'i' } },
          { tags: { $regex: searchTerm, $options: 'i' } },
          { highlight: { $regex: searchTerm, $options: 'i' } },
        ],
      },
    },
    {
      $project: {
        'shop.business_logo': 1,
        'shop.business_name': 1,
        deal: {
          _id: '$_id',
          title: '$title',
          regular_price: '$regular_price',
          discount: '$discount',
          discount_type: '$discount_type',
          coupon_required: '$coupon_required',
          isPromoted: '$isPromoted',
          promotedUntil: '$promotedUntil',
          images: '$images',
          nationwide: '$nationwide',
        },
      },
    },
    { $sort: { 'deal.promotedUntil': -1 } },
    {
      $facet: {
        deals: [{ $skip: skip }, { $limit: limit }],
        total: [{ $count: 'count' }],
      },
    },
  ]);

  const deals = result?.deals ?? [];
  const total = result?.total?.[0]?.count ?? 0;
  const ids = deals.map((doc: { deal: { _id: Types.ObjectId } }) =>
    doc.deal._id.toString()
  );

  setImmediate(() => {
    DealModel.updateMany(
      { _id: { $in: ids } },
      { $inc: { total_impression: 1 } }
    );
  });

  return {
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    deals,
  };
};

// 8. LOCATION MODE DEAL FETCH
const searchCurrentLocationDeals = async (
  query: Extract<
    SearchDealsByLocationQuery,
    { locationMode: 'CURRENT_LOCATION' }
  >,
  extraMatch: Record<string, unknown> = {}
) => {
  const now = new Date();
  const pipeline: PipelineStage[] = [
    {
      $geoNear: {
        near: {
          type: 'Point',
          coordinates: [query.lng, query.lat],
        },
        distanceField: 'distance',
        maxDistance: query.radiusKm * 1000,
        spherical: true,
        key: 'location',
        query: { isActive: true },
      },
    },
    getDealLookupStage(now, extraMatch),
    { $unwind: '$deal' },
    {
      $addFields: {
        'deal.distance': '$distance',
        'deal.nearest_location': '$_id',
        'deal.matched_location': {
          _id: '$_id',
          location_name: '$location_name',
          address: '$address',
          distance: '$distance',
        },
      },
    },
    { $replaceRoot: { newRoot: '$deal' } },
    { $addFields: { locationSort: 1 } }, // 1 = local, sorts after nationwide
    getNationwideDealsUnionStage(now, extraMatch),
    { $sort: { locationSort: 1, distance: 1 } },
    {
      $group: {
        _id: '$_id',
        doc: { $first: '$$ROOT' },
      },
    },
    { $replaceRoot: { newRoot: '$doc' } },
    getDealListFacet(query.page, query.limit, {
      locationSort: 1,
      distance: 1,
    }),
  ];

  const [result] = await Location.aggregate(pipeline);
  const deals = result?.deals ?? [];
  const total = result?.total?.[0]?.count ?? 0;

  recordDealImpressions(deals);

  return {
    meta: {
      locationMode: query.locationMode,
      locationLabel: buildLocationLabel(query),
      radiusKm: query.radiusKm,
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
    deals,
  };
};

const searchSelectedLocationDeals = async (
  query: Extract<
    SearchDealsByLocationQuery,
    { locationMode: 'SELECTED_LOCATION' }
  >,
  options: {
    extraMatch?: Record<string, unknown>;
    cacheResult?: boolean;
  } = {}
) => {
  const now = new Date();
  const extraMatch = options.extraMatch ?? {};
  const shouldCache = options.cacheResult ?? true;

  // ── Step 1 + 2: Resolve location documents (exact match → radius fallback) ──
  // resolveSelectedLocationDocs encapsulates the two-step location resolution
  // strategy: exact equality match first, 25-mile radius fallback if empty.
  const { locationIds, fallbackUsed, fallbackReason } =
    await resolveSelectedLocationDocs(query);

  // ── Step 2a: Special case — no locations exist at all in this region ──
  // When no Location documents exist for the country/state we cannot produce
  // any local deals.  Return only nationwide deals so the user still sees
  // relevant content (REQ 2.5).
  if (fallbackReason === 'NO_LOCATIONS_IN_REGION') {
    const [nationwideResult] = await DealModel.aggregate([
      // Seed the pipeline with nationwide deals directly on DealModel because
      // $unionWith requires a base collection — we use the deals collection
      // itself rather than Location (which has no matching docs).
      {
        $match: {
          nationwide: true,
          isPromoted: true,
          promotedUntil: { $gte: now },
          ...visibleDealFilter,
          ...extraMatch,
        },
      },
      {
        $addFields: {
          locationSort: 0,
          nearest_location: null,
          matched_location: null,
        },
      },
      getDealListFacet(query.page, query.limit, {
        locationSort: 1,
        promotedUntil: -1,
        createdAt: -1,
      }),
    ]);

    const deals = nationwideResult?.deals ?? [];
    const total = nationwideResult?.total?.[0]?.count ?? 0;

    recordDealImpressions(deals);

    if (shouldCache) {
      const cacheKey = buildLocationDealsCacheKey(query, true);
      await redisClient.set(
        cacheKey,
        JSON.stringify({
          meta: buildSelectedMeta(query, total, true, 'NO_LOCATIONS_IN_REGION'),
          deals,
        }),
        { EX: 180 }
      );
    }

    return {
      meta: buildSelectedMeta(query, total, true, 'NO_LOCATIONS_IN_REGION'),
      deals,
    };
  }

  // ── Steps 3–7: Normal / radius-fallback path ─────────────────────────────
  // At this point locationIds contains either exact-match IDs (fallbackUsed=false)
  // or nearby radius IDs (fallbackUsed=true, fallbackReason='NO_DEALS_IN_EXACT_LOCATION').

  // Track the actual fallback state — may be upgraded below if the city exists
  // but has no deals (the "zero-deals" fallback case).
  let actualFallbackUsed = fallbackUsed;
  let actualFallbackReason:
    | 'NO_DEALS_IN_EXACT_LOCATION'
    | 'NO_LOCATIONS_IN_REGION'
    | null = fallbackReason;
  let resolvedLocationIds = locationIds;

  // ── Step 3a: Pre-check — do any local deals exist for the resolved locations? ──
  // We check this BEFORE running the expensive full pipeline so we can trigger
  // the 200-mile radius fallback early when the city exists but has no deals.
  //
  // $unwind in the main pipeline silently drops Location docs with no deals,
  // so `deals.length` after the facet reflects local+nationwide combined —
  // not a reliable signal for "zero local deals". A cheap count avoids this.
  if (!fallbackUsed) {
    const localDealCount = await DealModel.countDocuments({
      available_in_location: { $in: locationIds },
      isPromoted: true,
      promotedUntil: { $gte: now },
      ...visibleDealFilter,
      ...extraMatch,
    });

    if (localDealCount === 0) {
      // City found but has no promoted deals — trigger 200-mile radius fallback
      const radiusResolution = await resolveSelectedLocationDocs(query, true);

      actualFallbackUsed = true;
      actualFallbackReason =
        radiusResolution.fallbackReason === 'NO_LOCATIONS_IN_REGION'
          ? 'NO_LOCATIONS_IN_REGION'
          : 'NO_DEALS_IN_EXACT_LOCATION';
      resolvedLocationIds = radiusResolution.locationIds;
    }
  }

  const [result] = await Location.aggregate([
    // ── Step 3: Match the resolved location documents ──
    { $match: { _id: { $in: resolvedLocationIds } } },

    // ── Step 3 (cont.): Join promoted deals for each location ──
    getDealLookupStage(now, extraMatch),

    // Unwind so each deal becomes its own root document
    { $unwind: '$deal' },

    // Annotate each deal with its source location for later use by the UI
    {
      $addFields: {
        'deal.nearest_location': '$_id',
        'deal.matched_location': {
          _id: '$_id',
          location_name: '$location_name',
          address: '$address',
        },
      },
    },

    // Promote deal to root so subsequent stages operate on the deal document
    { $replaceRoot: { newRoot: '$deal' } },

    // Mark as local — locationSort=1 means local deals sort after nationwide
    { $addFields: { locationSort: 1 } },

    // ── Step 5: Merge nationwide deals into the pipeline ──
    getNationwideDealsUnionStage(now, extraMatch),

    // Primary sort before dedup so $group keeps the best document per deal.
    // Nationwide (0) sorts before local (1); within each group sort by promotedUntil.
    { $sort: { locationSort: 1, promotedUntil: -1, createdAt: -1 } },

    // ── Step 6: Deduplicate — a deal may match both local and nationwide filters ──
    // Keep the nationwide copy (locationSort=0) over the local copy (locationSort=1)
    // because the earlier sort guarantees the nationwide doc comes first.
    {
      $group: {
        _id: '$_id',
        doc: { $first: '$$ROOT' },
      },
    },
    { $replaceRoot: { newRoot: '$doc' } },

    // ── Step 7: Final sort + paginate via shared facet helper ──
    getDealListFacet(query.page, query.limit, {
      locationSort: 1,
      promotedUntil: -1,
      createdAt: -1,
    }),
  ]);

  const deals = result?.deals ?? [];
  const total = result?.total?.[0]?.count ?? 0;

  recordDealImpressions(deals);

  if (shouldCache) {
    const cacheKey = buildLocationDealsCacheKey(query, actualFallbackUsed);
    await redisClient.set(
      cacheKey,
      JSON.stringify({
        meta: buildSelectedMeta(
          query,
          total,
          actualFallbackUsed,
          actualFallbackReason
        ),
        deals,
      }),
      { EX: 180 }
    );
  }

  return {
    meta: buildSelectedMeta(
      query,
      total,
      actualFallbackUsed,
      actualFallbackReason
    ),
    deals,
  };
};

/**
 * Builds the `meta` object for a SELECTED_LOCATION response.
 *
 * Extracted into a small helper to avoid duplicating the object shape across
 * the two return paths inside `searchSelectedLocationDeals`.
 */
const buildSelectedMeta = (
  query: Extract<
    SearchDealsByLocationQuery,
    { locationMode: 'SELECTED_LOCATION' }
  >,
  total: number,
  fallbackUsed: boolean,
  fallbackReason: 'NO_DEALS_IN_EXACT_LOCATION' | 'NO_LOCATIONS_IN_REGION' | null
) => ({
  locationMode: 'SELECTED_LOCATION' as const,
  locationLabel: buildLocationLabel(query),
  page: query.page,
  limit: query.limit,
  total,
  totalPages: Math.ceil(total / query.limit),
  fallbackUsed,
  fallbackReason,
});

// [GET]
const searchDealsByLocationService = async (
  query: SearchDealsByLocationQuery
) => {
  // ── CURRENT_LOCATION: simple single-key cache read → call → write ──
  // The key is fully determined before the call, so the standard pattern works.
  if (query.locationMode === 'CURRENT_LOCATION') {
    const cacheKey = buildLocationDealsCacheKey(query);
    const cachedData = await redisClient.get(cacheKey);

    if (cachedData) {
      dealLogger.debug('Cache hit: CURRENT_LOCATION');
      return JSON.parse(cachedData);
    }

    const data = await searchCurrentLocationDeals(query);

    await redisClient.set(cacheKey, JSON.stringify(data), { EX: 180 });
    return data;
  }

  // ── SELECTED_LOCATION: cache key depends on fallbackUsed (unknown up front) ──
  // We check both possible keys (fallback=false is the common case, try first).
  // The actual cache write is handled inside searchSelectedLocationDeals once
  // fallbackUsed is resolved, so we avoid any key-prediction problem (REQ 2.15).
  const cacheKeyNoFallback = buildLocationDealsCacheKey(query, false);
  const cacheKeyWithFallback = buildLocationDealsCacheKey(query, true);

  const cachedNoFallback = await redisClient.get(cacheKeyNoFallback);
  if (cachedNoFallback) {
    dealLogger.debug('Cache hit: SELECTED_LOCATION fallback=false');
    return JSON.parse(cachedNoFallback);
  }

  const cachedWithFallback = await redisClient.get(cacheKeyWithFallback);
  if (cachedWithFallback) {
    dealLogger.debug('Cache hit: SELECTED_LOCATION fallback=true');
    return JSON.parse(cachedWithFallback);
  }

  // Cache miss — delegate to the sub-function which resolves the location,
  // builds the pipeline, and writes the correctly-keyed cache entry.
  return searchSelectedLocationDeals(query);
};

// 9. GET USERS SAVED DEALS BY IDS
const getDealsByIdsService = async (
  ids: string[],
  query: Record<string, string>
) => {
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 10;
  const skip = (page - 1) * limit;

  // SEND CACHE RESPONSE
  const cacheKey = `saved:${ids.join(',')}-pages:${page}-limit:${limit}`;
  const getSaveDealsCache = await redisClient.get(cacheKey);
  if (getSaveDealsCache) {
    return JSON.parse(getSaveDealsCache);
  }

  const objectIds = ids.map((id) => new Types.ObjectId(id));

  const deals = await DealModel.find({
    _id: { $in: objectIds },
    ...visibleDealFilter,
  })
    .populate({
      path: 'shop',
      select: 'business_name business_logo',
    })
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(skip);

  // SAVED RESPONSE IN THE REDIS CACHE
  await redisClient.set(cacheKey, JSON.stringify(deals), { EX: 1200 });

  return deals;
};

// 10. GET TOP VIEWED DEALS
const topViewedDealsService = async (
  user: JwtPayload,
  query: Record<string, string>
) => {
  const getShop = await Shop.findOne({ vendor: user.userId });

  if (!getShop) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      'Shop not found',
      LoggerModule.DEAL
    );
  }

  const deals = await DealModel.find({ shop: getShop._id }, { _id: 1 });

  const dealIds = deals.map((d) => d._id);

  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 10;
  const skip = (page - 1) * limit;

  const topDeals = await Views_Impressions.aggregate([
    {
      $match: {
        deal: { $in: dealIds },
      },
    },

    {
      $group: {
        _id: '$deal',
        totalViews: {
          $sum: {
            $cond: [{ $eq: ['$type', 'view'] }, 1, 0],
          },
        },
        totalImpressions: {
          $sum: {
            $cond: [{ $eq: ['$type', 'impression'] }, 1, 0],
          },
        },
      },
    },

    { $sort: { totalViews: -1 } },

    { $skip: skip },
    { $limit: limit },

    {
      $lookup: {
        from: 'deals',
        localField: '_id',
        foreignField: '_id',
        as: 'deal',
      },
    },

    { $unwind: '$deal' },

    {
      $replaceRoot: {
        newRoot: {
          $mergeObjects: [
            '$deal',
            {
              totalViews: '$totalViews',
              totalImpressions: '$totalImpressions',
            },
          ],
        },
      },
    },
  ]);

  const totalDeals = await Views_Impressions.aggregate([
    {
      $match: {
        deal: { $in: dealIds },
      },
    },
    {
      $group: {
        _id: '$deal',
      },
    },
    {
      $count: 'total',
    },
  ]);

  const total = totalDeals[0]?.total || 0;

  const meta = {
    page,
    limit,
    total,
    totalPage: Math.ceil(total / limit),
  };

  return { meta, topDeals };
};

// 11. DEAL ANALYTICS
const dealAnalyticsService = async (authUserId: string, dealId: string) => {
  const isDealExistPromise = await DealModel.findOne({
    _id: dealId,
    user: authUserId,
  });
  const shopPromise = await Shop.findOne({ vendor: authUserId }).select('_id');

  const [isDealExist, shop] = await Promise.all([
    isDealExistPromise,
    shopPromise,
  ]);

  if (!isDealExist) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      'Deal not found',
      LoggerModule.DEAL
    );
  }

  if (!shop) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      'Shop not found',
      LoggerModule.DEAL
    );
  }

  const stats = await Views_Impressions.aggregate([
    { $match: { deal: new mongoose.Types.ObjectId(dealId) } },
    {
      $group: {
        _id: '$type',
        total: { $sum: 1 },
      },
    },
  ]);

  const meta: { impression: number; views: number } = {
    impression: 0,
    views: 0,
  };

  stats.map((m: { _id: string; total: number }) => {
    if (m._id === 'impression') {
      meta.impression = m.total;
    } else {
      meta.views = m.total;
    }
  });

  return {
    ...isDealExist.toObject(),
    totalViews: meta.views,
    totalImpression: meta.impression,
  };
};

// EXPORT ALL FUNCTION
export const dealsServices = {
  createDealsService,
  deleteDealsService,
  updateDealsService,
  getSingleDealsService,
  getMyDealsService,
  getDealsByCategoryService,
  getAllDealsService,
  getDealsByIdsService,
  topViewedDealsService,
  dealAnalyticsService,
  searchDealsByLocationService,
};
