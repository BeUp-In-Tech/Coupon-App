/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-explicit-any */
import mongoose, { Types, PipelineStage } from 'mongoose';
import { JwtPayload } from 'jsonwebtoken';
import { Shop } from '../shop/shop.model';
import { Role } from '../user/user.interface';
import AppError from '../../errorHelpers/AppError';
import StatusCodes from 'http-status-codes';
import { IDeal } from './deal.interface';
import { DealModel } from './deal.model';
import { Category } from '../categories/categories.model';
import { QueryBuilder } from '../../utils/QueryBuilder';
import { OutletModel } from '../outlet/outlet.model';
import { addImageDeleteJob } from '../../utils/imageDeleteJobAdd';
import { ShopApproval } from '../shop/shop.interface';
import { redisClient } from '../../config/redis.config';
import { Views_Impressions } from '../views_impression/vi.model';
import { generateCacheKey } from '../../utils/cacheKeyGen';
import { invalidateAllMachineryCache } from '../../utils/deleteCachedData';
import crypto from 'crypto';
import { sortObject } from '../../utils/sortObject';

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
    throw new AppError(StatusCodes.FORBIDDEN, 'Only vendor can create deals');
  }

  // IS SHOP EXIST BY USER ID
  const isShopExist = await Shop.findOne({ vendor: user.userId });

  // THROW ERROR IF SHOP IS NOT FOUND
  if (!isShopExist) {
    if (payload.images) {
      await addImageDeleteJob(payload.images);
    }

    if (payload.coupon_option.qr) {
      await addImageDeleteJob([payload.coupon_option.qr]);
    }

    if (payload.coupon_option.upc) {
      await addImageDeleteJob([payload.coupon_option.upc]);
    }

    throw new AppError(
      StatusCodes.NOT_FOUND,
      'No relatable shop found to upload this deal. Create a shop first.'
    );
  }


  if (
    !payload.coupon &&
    !payload.coupon_option?.qr &&
    !payload.coupon_option?.upc
  ) {
    if (payload.images) {
      await addImageDeleteJob(payload.images);
    }

    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'At least one of these required: Coupon code, Qr and Bar code'
    );
  }

  // THROW ERROR IF SHOP ALREADY REJECTED
  if (isShopExist.shop_approval === ShopApproval.REJECTED) {
    if (payload.images) {
      await addImageDeleteJob(payload.images);
    }

    if (payload.coupon_option.qr) {
      await addImageDeleteJob([payload.coupon_option.qr]);
    }

    if (payload.coupon_option.upc) {
      await addImageDeleteJob([payload.coupon_option.upc]);
    }

    throw new AppError(StatusCodes.FORBIDDEN, 'Your shop was rejected');
  }

  // THROW ERROR IF SHOP IS NOT APPROVED YET
  if (isShopExist.shop_approval !== ShopApproval.APPROVED) {
    if (payload.images) {
      await addImageDeleteJob(payload.images);
    }

    if (payload.coupon_option.qr) {
      await addImageDeleteJob([payload.coupon_option.qr]);
    }

    if (payload.coupon_option.upc) {
      await addImageDeleteJob([payload.coupon_option.upc]);
    }

    throw new AppError(StatusCodes.BAD_REQUEST, 'Wait for shop approval');
  }

  // IS CATEGORY EXIST
  const isCategoryExist = await Category.findById(categoryId).lean();
  if (!isCategoryExist) {
    if (payload.images) {
      await addImageDeleteJob(payload.images);
    }

    if (payload.coupon_option.qr) {
      await addImageDeleteJob([payload.coupon_option.qr]);
    }

    if (payload.coupon_option.upc) {
      await addImageDeleteJob([payload.coupon_option.upc]);
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
    tags: payload.tags,
    description: payload.description,
    images,
    available_in_outlet,
    coupon: payload.coupon,
    coupon_option: payload.coupon_option,
  };
  const doc = await DealModel.create(finalPayload);

  // REMOVE CACHE (DASHBOARD API CACHE)
  await redisClient.del('deals_by_category_stats');
  await invalidateAllMachineryCache('recent_deals:*');
  await invalidateAllMachineryCache('deals_stats:*');
  await invalidateAllMachineryCache(`my_deals-userId:${user.userId}:*`);

  return doc;
};

// 2. VIEW DEAL
const getSingleDealsService = async (
  _dealId: string,
  lat: number,
  lng: number
) => {
  const dealId = new mongoose.Types.ObjectId(_dealId);

  // IF DEAL NOT FOUND
  const deal = await DealModel.findById(dealId);

  if (!deal) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Deal not found');
  }

  // ADD VIEW
  Views_Impressions.create({
    deal: dealId,
    type: 'view',
  });

  const deals = await OutletModel.aggregate([
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
        foreignField: 'available_in_outlet',
        as: 'deal',
      },
    },

    { $unwind: '$deal' },

    // MATCH SPECIFIC DEAL
    {
      $match: {
        'deal._id': dealId,
      },
    },

    // ATTACH DISTANCE INTO OUTLET
    {
      $addFields: {
        'deal.available_outlet': {
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
        outlets: { $push: '$deal.available_outlet' },
      },
    },

    {
      $addFields: {
        'deal.available_outlet': '$outlets',
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
        available_in_outlet: 0,
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
    throw new AppError(StatusCodes.NOT_FOUND, 'Deal not found');
  }

  return final_deal;
};

// 3. DELETE DEAL
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

  await DealModel.deleteOne({ _id: serviceId });

  // 6. Delete images asynchronously using promises
  setImmediate(async () => {
    try {
      await addImageDeleteJob(isServiceExist.images);
    } catch (error) {
      console.error('Error deleting images from Cloudinary:', error);
    }
  });

  setImmediate(async () => {
    await invalidateAllMachineryCache('machinery:*');
    await invalidateAllMachineryCache('recent_deals:*');
    await invalidateAllMachineryCache('deals_stats:*');
    await invalidateAllMachineryCache(`my_deals-userId:${user.userId}:*`);
  });

  return null;
};

// 4. UPDATE DEAL
const updateDealsService = async (
  user: JwtPayload,
  dealId: string,
  payload: IDeal
) => {
  // CHECK IF THE DEAL EXISTS
  const deal = await DealModel.findById(dealId);

  if (!deal) {
    // DELETE IMAGE ASYNC
    setImmediate(async () => {
      // Delete image from cloudinary
      if (payload.images) {
        try {
          await addImageDeleteJob(payload.images);

          if (payload.coupon_option.qr) {
            await addImageDeleteJob([payload.coupon_option.qr]);
          }

          if (payload.coupon_option.upc) {
            await addImageDeleteJob([payload.coupon_option.upc]);
          }
        } catch (error: any) {
          console.log('Cloudinary image deletion error: ', error.message);
        }
      }
    });

    // Throw Error
    throw new AppError(StatusCodes.NOT_FOUND, 'Deal not found');
  }

  // CHECK IF THE USER IS AUTHORIZED TO UPDATE THE SERVICE
  if (deal.user.toString() !== user.userId) {
    // Delete image from cloudinary
    setImmediate(async () => {
      // Delete image from cloudinary
      if (payload.images) {
        try {
          await addImageDeleteJob(payload.images);

          if (payload.coupon_option.qr) {
            await addImageDeleteJob([payload.coupon_option.qr]);
          }

          if (payload.coupon_option.upc) {
            await addImageDeleteJob([payload.coupon_option.upc]);
          }
        } catch (error: any) {
          console.log('Cloudinary image deletion error: ', error.message);
        }
      }
    });
    // Throw Error
    throw new AppError(
      StatusCodes.UNAUTHORIZED,
      'You are not authorized to update this service'
    );
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

  // ONLY UPDATE TAGS IF CHANGES WERE MADE
  if (
    updatedTags.length !== deal.tags.length ||
    !updatedTags.every((val, index) => val === deal.tags[index])
  ) {
    updateData.tags = updatedTags;
  }

  // UPDATE COUPON CODE
  if (payload?.coupon) {
    updateData.coupon = payload.coupon;
  }

  // ONLY UPDATE QR CODE IF CHANGES WERE MADE
  if (payload?.coupon_option?.qr) {
    updateData.coupon_option = updateData.coupon_option || {
      upc: deal.coupon_option.upc,
    };
    updateData.coupon_option.qr = payload?.coupon_option?.qr;
  }

  // ONLY UPDATE UPC
  if (payload?.coupon_option?.upc) {
    updateData.coupon_option = updateData.coupon_option || {
      qr: deal.coupon_option.qr,
    };
    updateData.coupon_option.upc = payload?.coupon_option?.upc;
  }

  // UPDATE THE DEAL IN DATABASE
  const updateDeal = await DealModel.findByIdAndUpdate(dealId, updateData, {
    runValidators: true,
    new: true,
  });

  // DELETE IMAGES FROM CLOUDINARY ASYNCHRONOUSLY IF NEEDED
  setImmediate(async () => {
    // DEAL IMAGE DELETION
    if (payload.deletedImages && payload.deletedImages.length > 0) {
      try {
        await addImageDeleteJob(payload.deletedImages);
      } catch (error) {
        console.log(`Cloudinary image deleting error`, error);
      }
    }

    // QR IMAGE DELETION
    if (payload?.coupon_option?.qr) {
      try {
        await addImageDeleteJob([deal.coupon_option.qr as string]);
      } catch (e) {
        console.log(`Cloudinary image deleting error`, e);
      }
    }

    // UPC IMAGE DELETION
    if (payload?.coupon_option?.upc) {
      try {
        await addImageDeleteJob([deal.coupon_option.upc as string]);
      } catch (e) {
        console.log(`Cloudinary image deleting error`, e);
      }
    }
  });

  // REMOVE REDIS CACHE KEY
  setImmediate(async () => {
    await redisClient.del(`shop:${updateDeal?.shop.toString()}`);
    await invalidateAllMachineryCache('machinery:*');
    await invalidateAllMachineryCache('recent_deals:*');
    await invalidateAllMachineryCache('deals_stats:*');
    await invalidateAllMachineryCache(`my_deals-userId:${user.userId}:*`);
  });

  // RETURN DATA
  return updateDeal;
};

// 5. GET MY DEALS
const getMyDealsService = async (
  userId: string,
  query: Record<string, string>
) => {
  const page = query.page ? Number(query.page) : 1;
  const limit = query.limit ? Number(query.limit) : 10;

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
  const queryWithDefaults = { page, limit, ...query };

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
  const queryBuilder = new QueryBuilder(DealModel.find(filter), query);
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
  lng: number,
  lat: number,
  categoryId: string,
  query: Record<string, string>
) => {
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 20;
  const skip = (page - 1) * limit;
  const categoryObjectId = new mongoose.Types.ObjectId(categoryId);

  // Build the sort object.
  const sort: Record<string, 1 | -1> = {};
  if (query.sort) {
    const sortField = query.sort.startsWith('-')
      ? query.sort.substring(1)
      : query.sort;
    const sortOrder = query.sort.startsWith('-') ? -1 : 1;
    // Let's assume non-distance fields are on the 'deal' sub-document
    if (sortField === 'distance') {
      sort[sortField] = sortOrder;
    } else {
      sort[`deal.${sortField}`] = sortOrder;
    }
  } else {
    // Default to distance ascending.
    sort['distance'] = 1;
  }

  if (!lng || !lat || !categoryId) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'lng, lat, and categoryId are required'
    );
  }

  // Aggregation pipeline
  const deals = await OutletModel.aggregate([
    //  GeoNear stage
    {
      $geoNear: {
        near: { type: 'Point', coordinates: [lng, lat] },
        distanceField: 'distance',
        spherical: true,
        key: 'location',
        query: { isActive: true },
      },
    },
    //  Join deals
    {
      $lookup: {
        from: 'deals',
        localField: '_id',
        foreignField: 'available_in_outlet',
        as: 'deal',
      },
    },
    { $unwind: '$deal' },
    // Filter by category

    {
      $match: {
        'deal.category': categoryObjectId,
      },
    },
    // Only promoted deals
    {
      $match: {
        'deal.isPromoted': true,
        'deal.promotedUntil': { $gte: new Date() },
      },
    },
    // Join shop info
    {
      $lookup: {
        from: 'shops',
        localField: 'shop',
        foreignField: '_id',
        as: 'shop',
      },
    },
    { $unwind: '$shop' },

    // Keep the nearest outlet copy first so duplicate deals collapse correctly.
    { $sort: { distance: 1 } },

    // Remove duplicate deals coming from multiple outlets.
    {
      $group: {
        _id: '$deal._id',
        doc: { $first: '$$ROOT' },
      },
    },

    { $replaceRoot: { newRoot: '$doc' } },

    // Apply requested ordering on the deduplicated deal list.
    { $sort: sort },

    // Project needed fields
    {
      $project: {
        distance: 1,
        'shop._id': 1,
        'shop.business_name': 1,
        'shop.business_logo': 1,
        'deal._id': 1,
        'deal.title': 1,
        'deal.reguler_price': 1,
        'deal.discount': 1,
        'deal.isPromoted': 1,
        'deal.promotedUntil': 1,
        'deal.images': 1,
      },
    },

    // Pagination
    { $skip: skip },
    { $limit: limit },
  ]);

  // Total promoted deals count
  const total = await DealModel.countDocuments({
    category: categoryObjectId,
    isPromoted: true,
    promotedUntil: { $gte: new Date() },
  });

  // Increment impressions asynchronously
  const ids = deals.map((doc) => doc.deal._id.toString());
  setImmediate(() => {
    DealModel.updateMany(
      { _id: { $in: ids } },
      { $inc: { total_impression: 1 } }
    );
  });

  // Response meta
  const meta = {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  };

  return { meta, deals };
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

  const searchTerm = query.search || '';
  const fields = query.select ? query.select.split(',') : [];
  const filter: Record<string, any> = {};

  // STEP 1: GENERATE CACHE KEY
  if (query.category) filter.category = query.category;
  if (query.brand) filter.brand = query.brand;

  const cacheKey = generateCacheKey({
    searchTerm,
    filter,
    page: Number(query.page) || 1,
    limit: Number(query.limit) || 10,
    sort: query.sort || '',
    fields,
    lat: userLat,
    lng: userLng,
  });

  // STEP 2: CHECK CACHE
  const cachedData = await redisClient.get(cacheKey);
  if (cachedData) {
    return JSON.parse(cachedData);
  }

  // DATABASE QUERY
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
        maxDistance: 48000, //  30 miles (approximate) radius
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

  // RESOLVE ALL PROMISE PARALLEL
  const [nearestDeals, totalPromotedDoc] = await Promise.all([
    nearestDealsPromise,
    totalPromotedDocPromise,
  ]);

  // EXTRACT IDS
  const ids = nearestDeals.map((doc) => doc._id.toString());
  const uniqueIds = [...new Set(ids)];

  // INCREASE IMPRESSION OF LOADED DATA
  setImmediate(async () => {
    // create analytics documents
    const analyticsDocs = uniqueIds.map((dealId) => ({
      deal: dealId,
      type: 'impression',
    }));

    await Views_Impressions.insertMany(analyticsDocs);
  });

  // CREATE META DATA
  const meta = {
    page,
    limit,
    total: totalPromotedDoc,
    totalPages: Math.ceil(totalPromotedDoc / limit),
  };

  const data = {
    meta,
    deals: nearestDeals,
  };

  // STEP 3: SAVE RESULT TO REDIS (10 min)
  await redisClient.set(cacheKey, JSON.stringify(data), {
    EX: 600,
  });

  return data;
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

    // STAGE 3: JOIN WITH SHOP FOR SHOP DETAILS
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

    // STAGE 4: SEARCH WITH SEARCH KEYWORD
    {
      $match: {
        $or: [
          { 'shop.business_name': { $regex: searchTerm, $options: 'i' } },
          { 'deal.title': { $regex: searchTerm, $options: 'i' } },
          { 'deal.description': { $regex: searchTerm, $options: 'i' } },
          { 'deal.tags': { $regex: searchTerm, $options: 'i' } },
          { 'deal.highlight': { $regex: searchTerm, $options: 'i' } },
          { zip_code: { $regex: searchTerm, $options: 'i' } },
        ],
      },
    },

    {
      $sort: { distance: 1 },
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

    // STAGE 6: PREVENT DUPLICATE RESULT FOR DISTANCE, KEEP ONLY NEAREST RESULT
    {
      $group: {
        _id: '$deal._id',
        doc: { $first: '$$ROOT' },
      },
    },
    {
      $replaceRoot: { newRoot: '$doc' },
    },

    // STAGE 6: FINAL PROJECTION
    {
      $project: {
        'shop.business_logo': 1,
        'shop.business_name': 1,
        distance: 1,
        'deal._id': 1,
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

  // EXTRACT IDS
  const ids = deals.map((doc) => doc.deal._id.toString());
  const uniqueIds = [...new Set(ids)];

  // INCREASE IMPRESSION OF LOADED DATA
  setImmediate(async () => {
    await DealModel.updateMany(
      { _id: { $in: uniqueIds } },
      { $inc: { total_impression: 1 } }
    );
  });

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

// 8. GET USERS SAVED DEALS BY IDS
const getDealsByIdsService = async (
  ids: string[],
  query: Record<string, string>
) => {
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 10;
  const skip = (page - 1) * limit;

  // SEND CACHE RESPONSE
  const cacheKey = `saved:${ids.join(',')}-pages:${page}-limit:${limit}`;
  const getSavedealsCache = await redisClient.get(cacheKey);
  if (getSavedealsCache) {
    return JSON.parse(getSavedealsCache);
  }

  const objectIds = ids.map((id) => new Types.ObjectId(id));

  const deals = await DealModel.find({ _id: { $in: objectIds } })
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

// 9. GET TOP VIEWED DEALS
const topViewedDealsService = async (
  user: JwtPayload,
  query: Record<string, string>
) => {
  const getShop = await Shop.findOne({ vendor: user.userId });

  if (!getShop) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Shop not found');
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

// 10. DEAL ANALYTICS
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
    throw new AppError(StatusCodes.NOT_FOUND, 'Deal not found');
  }

  if (!shop) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Shop not found');
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

  return {
    ...isDealExist.toObject(),
    totalViews: stats[0]?.total,
    totalImpression: stats[1]?.total,
  };
};

// EXPORT ALL FUNCTION
export const dealsServices = {
  createDealsService,
  deleteDealsService,
  updateDealsService,
  getSingleDealsService,
  getMyDealsService,
  getNearestDealsService,
  getDealsByCategoryService,
  getAllDealsService,
  getDealsByIdsService,
  topViewedDealsService,
  dealAnalyticsService,
};
