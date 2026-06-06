/* eslint-disable @typescript-eslint/no-explicit-any */
import { StatusCodes } from 'http-status-codes';
import AppError from '../../errorHelpers/AppError';
import User from '../user/user.model';
import { IShop, ShopApproval } from './shop.interface';
import { Shop } from './shop.model';
import { Role } from '../user/user.interface';
import mongoose, { Types } from 'mongoose';
import { OutletModel } from '../outlet/outlet.model';
import { JwtPayload } from 'jsonwebtoken';
import { addImageDeleteJob } from '../../utils/imageDeleteJobAdd';
import { redisClient } from '../../config/redis.config';
import { NotificationType } from '../notification/notification.interface';
import env from '../../config/env';
import { DealModel } from '../deal/deal.model';
import { mailQueue, notificationQueue } from '../../queue/index.queue';
import { Views_Impressions } from '../views_impression/vi.model';
import { invalidateAllMachineryCache } from '../../utils/deleteCachedData';

// Custom interface
interface ShopCreatePayload {
  shop: IShop;
  outlet: {
    outlet_name: string;
    address: string;
    zip_code: string;
    coordinates: [number, number];
  }[];
}

// CREATE SHOP
const createShopService = async (
  user: JwtPayload,
  payload: ShopCreatePayload
) => {
  if (!payload.shop.business_logo) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'business_logo missing');
  }

  const isUser = await User.findById(user.userId);
  if (!isUser) {
    if (payload.shop.business_logo) {
      await addImageDeleteJob([payload.shop.business_logo]); // Delete image first
    }
    throw new AppError(StatusCodes.NOT_FOUND, 'User not found');
  }

  // CHECK USER VERIFIED
  if (!isUser.isVerified) {
    if (payload.shop.business_logo) {
      await addImageDeleteJob([payload.shop.business_logo]); // Delete image first
    }

    // Throw Error
    throw new AppError(StatusCodes.BAD_REQUEST, 'Verify your profile');
  }

  const vendorId = new Types.ObjectId(user.userId);

  // Security rule: 1 vendor => 1 shop (remove if you allow multiple)
  const alreadyHasShop = await Shop.findOne({ vendor: vendorId })
    .select('_id')
    .lean();
  if (alreadyHasShop) {
    if (payload.shop.business_logo) {
      await addImageDeleteJob([payload.shop.business_logo]); // Delete image first
    }

    // THROW Error
    throw new AppError(
      StatusCodes.CONFLICT,
      'Shop already exists for this vendor'
    );
  }

  const adminUser = await User.findOne({ email: env.ADMIN_MAIL })
    .select('_id')
    .lean();

  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    // 1) Create shop
    const [shopDoc] = await Shop.create(
      [
        {
          vendor: vendorId,
          business_name: payload.shop.business_name.trim(),
          business_email: isUser.email.trim().toLowerCase(),
          business_phone: payload.shop.business_phone,
          business_logo: payload.shop.business_logo,
          description: payload.shop.description.trim(),
          website: payload.shop.website?.trim(),
        },
      ],
      { session }
    );

    // 2) Create outlets linked to shop
    const outlets = (payload.outlet || []).map((o) => ({
      shop: shopDoc._id,
      vendor: vendorId,
      outlet_name: o.outlet_name,
      address: o.address.trim(),
      zip_code: o.zip_code.trim(),
      location: {
        type: 'Point',
        coordinates: [...o.coordinates],
      },
    }));

    if (outlets.length) {
      await OutletModel.insertMany(outlets, { session, ordered: true });
    }

    // REMOVE CACHE (DASHBOARD API CACHE)
    await invalidateAllMachineryCache('all_vendors_dashboard:*'); // recent vendors stats

    // SESSION END
    await session.commitTransaction();
    session.endSession();

    await redisClient.del(`user_me:${vendorId}`);

    // NOTIFY ADMIN ABOUT NEW SHOP APPROVAL REQUEST
    if (adminUser?._id) {
      setImmediate(async () => {
        try {
          await notificationQueue.add(
            'sendNotification',
            {
              user: adminUser._id,
              title: 'New shop approval request',
              body: `${payload.shop.business_name.trim()} submitted a new shop for approval.`,
              type: NotificationType.SHOP,
              entityId: shopDoc._id.toString(),
              webUrl: `${env.FRONTEND_URL}/dashboard/admin-vendor`,
              deepLink: `${env.DEEP_LINK}dashboard/admin-vendor`,
              data: {
                shopId: shopDoc._id.toString(),
                shopName: payload.shop.business_name.trim(),
                vendorId: vendorId.toString(),
              },
            },
            {
              attempts: 3,
              backoff: {
                type: 'exponential',
                delay: 3000,
              },
              jobId: `shop-approval-request-${shopDoc._id.toString()}`,
              removeOnComplete: true,
              removeOnFail: 1000,
            }
          );
        } catch (error) {
          // eslint-disable-next-line no-console
          console.log('Admin notification queue error:', error);
        }
      });
    }

    return {
      shop: shopDoc,
      outlets_created: outlets.length,
    };
  } catch (err: any) {
    await session.abortTransaction();
    session.endSession();

    // Duplicate key handling (unique index errors)
    if (err?.code === 11000) {
      throw new AppError(
        StatusCodes.CONFLICT,
        `Duplicate key: ${JSON.stringify(err.keyValue)}`
      );
    }

    throw err;
  }
};

// GET SHOP DETAILS
const getShopDetailsService = async (shopId?: string, my_shop?: string) => {
  const shopDynamicId = my_shop ? my_shop : shopId;

  // CREATED DYNAMIC SHOP CACHE KEY
  const shopCacheKey = `shop:${shopDynamicId}`;

  // GET DATA FROM REDIS AND RETURN
  if (shopCacheKey) {
    const shopData = await redisClient.get(shopCacheKey);
    if (shopData) {
      return JSON.parse(shopData);
    }
  }

  const shopQuery: Record<string, any> = {};

  if (my_shop) {
    shopQuery.vendor = new Types.ObjectId(my_shop);
  } else if (shopId) {
    shopQuery._id = new Types.ObjectId(shopId);
  }

  // Aggregate shop

  const isShopExist = await Shop.aggregate([
    {
      $match: shopQuery,
    },
    {
      $lookup: {
        from: 'outlets',
        localField: '_id',
        foreignField: 'shop',
        as: 'outlets',
      },
    },
    {
      $lookup: {
        from: 'deals',
        let: { shop: '$_id' },
        pipeline: [
          { $match: { $expr: { $eq: ['$shop', '$$shop'] } } },
          {
            $match: {
              isPromoted: true,
              promotedUntil: { $gte: new Date() },
              isBanned: { $ne: true }
            },
          },
        ],
        as: 'deals',
      },
    },
  ]);

  if (isShopExist.length <= 0) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Shop not found!');
  }

  // STORE DATA IN REDIS
  await redisClient.set(shopCacheKey, JSON.stringify(isShopExist[0]), {
    EX: 10 * 60,
  }); // Store for 10 min

  return isShopExist[0];
};

// UPDATE SHOP
const updateShopService = async (
  userId: string,
  shopId: string,
  payload: Partial<IShop>
) => {
  // 1. ensure user exists
  const user = await User.findById(userId).select('_id email role');
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

  // 3. Shop existence
  const shop = await Shop.findById(shopId).select('business_logo');
  if (!shop) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Shop not found');
  }

  // 4. build controlled update object
  const updateData: Record<string, any> = {};
  const unsetData: Record<string, any> = {};

  if (payload.business_name) updateData.business_name = payload.business_name;

  if (payload.description) updateData.description = payload.description;

  if (payload.website !== undefined) {
    const website = payload.website.trim();

    if (website === '') {
      unsetData.website = 1;
    } else {
      updateData.website = website;
    }
  }

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

  // 5. If have image, delete previous one
  if (payload.business_logo) {
    updateData.business_logo = payload.business_logo;
  }

  // 6. prevent empty update
  if (
    Object.keys(updateData).length === 0 &&
    Object.keys(unsetData).length === 0
  ) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'No valid fields provided for update'
    );
  }

  // 7.. atomic ownership update
  const updateQuery: Record<string, any> = {};
  if (Object.keys(updateData).length > 0) updateQuery.$set = updateData;
  if (Object.keys(unsetData).length > 0) updateQuery.$unset = unsetData;

  const validator = { new: true, runValidators: true };
  const updatedShop = await Shop.findOneAndUpdate(
    filter,
    updateQuery,
    validator
  );

  if (!updatedShop) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Shop not found or unauthorized');
  }

  // =================BACKGROUND JOB HANDLING==============

  // DELETE EXISTING IMAGE ASYNCHRONOUSLY TO PREVENT LOAD FOR MAIN API RESPONSE
  setImmediate(async () => {
    // Delete old business logo
    if (payload.business_logo && shop.business_logo) {
      await addImageDeleteJob([shop.business_logo]);
    }
  });

  //==================================================== BULLMQ JOB PROCESSING================================
  // IF SHOP APPROVAL 'APPROVED'
  if (
    payload.shop_approval &&
    payload.shop_approval === ShopApproval.APPROVED
  ) {
    // =============SEND NOTIFICATION=============
    const notificationPayload = {
      user: updatedShop.vendor,
      title: 'Congratulations! Your shop approved by Yepp',
      body: 'Your shop is live now. You can promote your service and deals',
      type: NotificationType.SHOP,
      entityId: shopId,
      webUrl: `${env.FRONTEND_URL}/create-deal`,
      deepLink: `${env.DEEP_LINK}create-deal`,
    };

    // SEND EMAIL TO QUEUE
    await notificationQueue.add('sendNotification', notificationPayload, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 3000,
      },
      removeOnComplete: true,
      removeOnFail: 1000,
    });

    //================= SEND EMAIL ==========================
    const shopOwner = await User.findOne({ _id: updatedShop.vendor });
    if (!shopOwner) {
      return 0;
    }

    const now = new Date().toLocaleString();
    const emailPayload = {
      to: shopOwner.email,
      subject: 'Congratulations! Your shop approved by Yepp',
      templateName: 'shop_approval',
      templateData: {
        shop_owner_name: shopOwner.user_name,
        shop_name: updatedShop.business_name,
        entityId: updatedShop._id.toString(),
        approval_date: now,
        support_mail: env.EMAIL_FROM,
        redirect_url: `${env.FRONTEND_URL}/create-deal`,
      },
    };

    // SEND EMAIL TO QUEUE
    await mailQueue.add('sendEmail', emailPayload, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      jobId: `shop-approval-${shopId}`,
      removeOnComplete: true,
    });

    // AFTER APPROVE SHOP CACHE INVALIDATE
    await redisClient.del(`shop:${shopOwner._id}`);
  }

  // IF SHOP APPROVAL 'REJECTED'
  if (
    payload.shop_approval &&
    payload.shop_approval === ShopApproval.REJECTED
  ) {
    // =============SEND NOTIFICATION AND EMAIL============
    const notificationPayload = {
      user: updatedShop.vendor,
      title: 'Your shop rejected by Yepp',
      body: 'Please kindly submit valid data and information about your business',
      type: NotificationType.SHOP,
      entityId: shopId,
      webUrl: `${env.FRONTEND_URL}`,
      deepLink: `${env.DEEP_LINK}`,
    };

    // SEND EMAIL TO QUEUE
    await notificationQueue.add('sendNotification', notificationPayload, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 3000,
      },
      removeOnComplete: true,
      removeOnFail: 1000,
    });

    // ==================SEND EMAIL===============
    const shopOwner = await User.findOne({ _id: updatedShop.vendor });
    if (!shopOwner) {
      return 0;
    }

    const now = new Date().toLocaleString();

    const emailPayload = {
      to: shopOwner.email,
      subject: 'Your shop creation rejected by Yepp',
      templateName: 'shop_rejection',
      templateData: {
        shop_owner_name: shopOwner.user_name,
        shop_name: updatedShop.business_name,
        entityId: updatedShop._id.toString(),
        reviewed_date: now,
        support_mail: env.EMAIL_FROM,
        redirect_url: `${env.FRONTEND_URL}/create-shop`,
      },
    };

    // SEND EMAIL TO QUEUE
    await mailQueue.add('sendEmail', emailPayload, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      jobId: `shop-approval-${shopId}`,
      removeOnComplete: true,
    });

    // AFTER APPROVE SHOP CACHE INVALIDATE
    await redisClient.del(`shop:${shopOwner._id}`);
  }

  // REMOVE ALL CACHE KEY WHEN UPDATE
  await redisClient.del(`shop:${userId}`);
  await redisClient.del(`shop:${shopId}`);
  await redisClient.del(`dashboard_analytics_total`); // dashboard analytics total
  await invalidateAllMachineryCache('machinery:*'); // nearest deals cache
  await invalidateAllMachineryCache('recent_deals:*'); // dashboard recent deals cache
  await invalidateAllMachineryCache('saved:*'); // saved deals cache
  await invalidateAllMachineryCache('recent_vendors:*'); // dashboard recent vendor stat
  await invalidateAllMachineryCache('all_vendors_dashboard:*'); // dashboard vendors stat

  return updatedShop;
};

// SHOP ANALYTICS
const getDealAnalyticsService = async (user: JwtPayload) => {
  const userObjectId = new mongoose.Types.ObjectId(user.userId);

  if (user.role !== Role.VENDOR) {
    throw new AppError(StatusCodes.FORBIDDEN, 'Forbidden');
  }

  const findVendorShop = await Shop.findOne({ vendor: userObjectId });

  if (!findVendorShop) {
    throw new AppError(StatusCodes.FORBIDDEN, 'No shop found');
  }

  const deals = await DealModel.find(
    { shop: findVendorShop._id },
    { _id: 1, isPromoted: 1 }
  );

  const dealIds = deals.map((d) => d._id);

  const activeDeals = deals.filter((d) => d.isPromoted).length;

  const analytics = await Views_Impressions.aggregate([
    {
      $match: {
        deal: { $in: dealIds },
      },
    },
    {
      $group: {
        _id: null,
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
  ]);

  const totals = analytics[0] || {
    totalViews: 0,
    totalImpressions: 0,
  };

  return {
    _id: null,
    activeDeals,
    totalViews: totals.totalViews,
    totalImpressions: totals.totalImpressions,
  };
};

// YEARLY ANALYTICS - 3 YEARS PERIODIC
const getPrevious3YearsMonthlyAnalytics = async (user: JwtPayload) => {
  const userObjectId = new mongoose.Types.ObjectId(user.userId);

  if (user.role !== Role.VENDOR) {
    throw new AppError(StatusCodes.FORBIDDEN, 'Forbidden');
  }

  const vendorShop = await Shop.findOne({ vendor: userObjectId });

  if (!vendorShop) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Shop not found');
  }

  const deals = await DealModel.find({ shop: vendorShop._id }, { _id: 1 });

  const dealIds = deals.map((d) => d._id);

  const currentYear = new Date().getFullYear();
  const startYear = currentYear - 2;

  const startDate = new Date(`${startYear}-01-01`);
  const endDate = new Date(`${currentYear}-12-31`);

  const stats = await Views_Impressions.aggregate([
    {
      $match: {
        deal: { $in: dealIds },
        createdAt: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $project: {
        year: { $year: '$createdAt' },
        month: { $month: '$createdAt' },
        type: 1,
      },
    },
    {
      $group: {
        _id: {
          year: '$year',
          month: '$month',
        },
        views: {
          $sum: {
            $cond: [{ $eq: ['$type', 'view'] }, 1, 0],
          },
        },
        impressions: {
          $sum: {
            $cond: [{ $eq: ['$type', 'impression'] }, 1, 0],
          },
        },
      },
    },
    {
      $sort: {
        '_id.year': 1,
        '_id.month': 1,
      },
    },
  ]);

  const result: Record<
    string,
    { month: number; views: number; impressions: number }[]
  > = {};

  for (let y = startYear; y <= currentYear; y++) {
    result[y] = [];

    for (let m = 1; m <= 12; m++) {
      const data = stats.find((s) => s._id.year === y && s._id.month === m);

      result[y].push({
        month: m,
        views: data?.views || 0,
        impressions: data?.impressions || 0,
      });
    }
  }

  return result;
};

export const shopServices = {
  createShopService,
  getShopDetailsService,
  updateShopService,
  getDealAnalyticsService,
  getPrevious3YearsMonthlyAnalytics,
};
