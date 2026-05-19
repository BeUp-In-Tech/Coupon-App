/* eslint-disable @typescript-eslint/no-explicit-any */
import AppError from '../../errorHelpers/AppError';
import env from '../../config/env';
import admin from '../../config/firebase.config';
import { redisClient } from '../../config/redis.config';
import { sendBulkEmails } from '../../queue/helper/multipleEmailSendJob';
import { QueryBuilder } from '../../utils/QueryBuilder';
import { DealModel } from '../deal/deal.model';
import { NotificationType } from '../notification/notification.interface';
import { NotificationModel } from '../notification/notification.model';
import { PaymentStatus } from '../payment/payment.interface';
import { PaymentModel } from '../payment/payment.model';
import { ShopApproval } from '../shop/shop.interface';
import { Shop } from '../shop/shop.model';
import User from '../user/user.model';
import { IDashBoardNotificationPayload } from './dashboard.interface';

// 1. CATEGORY BY PROMOTED DEAL COUNT
const dealsByCategoryStats = async () => {
  const cacheKey = 'deals_by_category_stats';
  const getCachedData = await redisClient.get(cacheKey);

  // RETURN CACHED DATA
  if (getCachedData) {
    return JSON.parse(getCachedData);
  }

  const dealsByCategory = await DealModel.aggregate([
    {
      $group: {
        _id: '$category',
        count: { $sum: 1 },
      },
    },
    {
      $lookup: {
        from: 'categories', // MongoDB collection name
        localField: '_id',
        foreignField: '_id',
        as: 'category_info',
      },
    },
    {
      $unwind: '$category_info',
    },
    {
      $project: {
        _id: 0,
        categoryId: '$category_info._id',
        category_name: '$category_info.category_name',
        count: 1,
      },
    },
    {
      $sort: { count: -1 }, // optional: sort by count
    },
  ]);

  // Calculate total deals
  const totalPromotedDeals = dealsByCategory.reduce(
    (acc, curr) => acc + curr.count,
    0
  );

  const data = {
    totalPromotedDeals,
    dealsByCategory,
  };

  // STORE DATA IN REDIS
  await redisClient.set(cacheKey, JSON.stringify(data), {
    EX: 3600, // 1 hour
  });

  // return data
  return data;
};

// 2. VENDORS STATS
const allVendorsStats = async (query: Record<string, string>) => {
  const searchTerm = query.searchTerm || '';
  const approval = query.shop_approval || '';
  const sort = query.sort || '-totalDeals';

  const page = query.page ? Number(query.page) : 1;
  const limit = query.limit ? Number(query.limit) : 10;
  const skip = (page - 1) * limit;

  const approvalFilter = approval ? approval.toUpperCase().trim() : '';

  if (
    approvalFilter &&
    !Object.values(ShopApproval).includes(approvalFilter as ShopApproval)
  ) {
    throw new AppError(400, 'Invalid shop approval filter');
  }

  // Dynamic sort
  const sortObj: Record<string, 1 | -1> = {};
  const field = sort.startsWith('-') ? sort.substring(1) : sort;
  const order = sort.startsWith('-') ? -1 : 1;
  sortObj[field] = order;
  

  // MAKE REDIS KEY
  const cacheKey = `all_vendors_dashboard:${approvalFilter}_${searchTerm}_${page}_${limit}_${sort}`;
  const getCachedData = await redisClient.get(cacheKey);

  // RETURN CACHED DATA
  if (getCachedData) {
    return JSON.parse(getCachedData);
  }

  let pipeline: any[] = [];

  pipeline.push(
    {
      $lookup: {
        from: 'deals',
        localField: '_id',
        foreignField: 'shop',
        as: 'deals',
      },
    },
    {
      $addFields: {
        totalDeals: { $size: { $ifNull: ['$deals', []] } },
      },
    },
    {
      $lookup: {
        from: 'users',
        localField: 'vendor',
        foreignField: '_id',
        as: 'vendor',
        pipeline: [
          {
            $project: { user_name: 1 },
          },
        ],
      },
    },
    {
      $unwind: {
        path: '$vendor',
        preserveNullAndEmptyArrays: true, // Keep docs even if no user is found
      },
    },
    {
      $lookup: {
        from: 'payments',
        let: { userId: '$vendor._id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$user', '$$userId'] },
                  { $eq: ['$payment_status', 'PAID'] },
                ],
              },
            },
          },
          {
            $group: {
              _id: null,
              totalRevenue: { $sum: '$amount' },
            },
          },
        ],
        as: 'revenue',
      },
    },
    {
      $unwind: {
        path: '$revenue',
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $addFields: {
        totalRevenue: { $ifNull: ['$revenue.totalRevenue', 0] },
      },
    },
    {
      $project: {
        _id: 1,
        business_name: 1,
        totalRevenue: 1,
        vendor: 1,
        business_email: 1,
        shop_approval: 1,
        totalDeals: 1,
        createdAt: 1,
      },
    }
  );

  if (approvalFilter) {
    pipeline.push({
      $match: {
        shop_approval: approvalFilter,
      },
    });
  }

  // SEARCH (optional)
  if (searchTerm) {
    pipeline.push({
      $match: {
        $or: [
          { business_name: { $regex: searchTerm, $options: 'i' } },
          { 'vendor.user_name': { $regex: searchTerm, $options: 'i' } },
        ],
      },
    });
  }

  pipeline.push(
    {
      $sort: sortObj,
    },
    {
      $skip: skip,
    },
    {
      $limit: limit,
    }
  );

  const vendorsStatsPromise = await Shop.aggregate(pipeline);
  pipeline = [];

  const totalVendorsPromise = Shop.countDocuments();
  const totalActiveVendorsPromise = Shop.countDocuments({
    shop_approval: ShopApproval.APPROVED,
  });
  const totalPendingVendorsPromise = Shop.countDocuments({
    shop_approval: ShopApproval.PENDING,
  });

  const [vendorsStats, totalVendors, totalActiveVendors, totalPendingVendors] =
    await Promise.all([
      vendorsStatsPromise,
      totalVendorsPromise,
      totalActiveVendorsPromise,
      totalPendingVendorsPromise,
    ]);

  const final_data = {
    summery: { totalVendors, totalActiveVendors, totalPendingVendors },
    vendors: vendorsStats,
  };

  // STORE DATA IN REDIS
  await redisClient.set(cacheKey, JSON.stringify(final_data), {
    EX: 3600, // 1 hour
  });

  // Return data
  return final_data;
};

// 3. RECENT DEALS STATS
const recentDealsStats = async (query: Record<string, string>) => {
  const fields = query.fields ? query.fields : '';
  const page = query.page ? query.page : 1;
  const limit = query.limit ? query.limit : 10;
  const sort = query.sort ? query.sort : '-createdAt';

  // MAKE CACHE KEY
  const cacheKey = `recent_deals:${fields}_${page}_${limit}_${sort}`;
  const getCachedData = await redisClient.get(cacheKey);

  // RETURN CACHED DATA
  if (getCachedData) {
    return JSON.parse(getCachedData);
  }

  /// DATABASE QUERY
  const queryBuilder = new QueryBuilder(DealModel.find(), query);
  const vendors = await queryBuilder
    .filter()
    .select()
    .join()
    .sort()
    .paginate()
    .build();

  const meta = await queryBuilder.getMeta();

  const data = {
    meta,
    vendors,
  };

  // STORE DATA IN REDIS
  await redisClient.set(cacheKey, JSON.stringify(data), {
    EX: 3600, // 1 hour
  });

  // Return data
  return data;
};

// 4. DEALS STATS
const dealsStats = async (query: Record<string, string>) => {
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 10;
  const skip = (page - 1) * limit;

  // SORTING MERGE
  const sortBy = (query.sortBy as string) || 'createdAt';
  const sortOrder = sortBy === 'createdAt' ? 1 : -1;
  const removeExtraSymbols = sortBy.startsWith('-') ? sortBy.slice(1) : sortBy;
  const sortStage: any = {};
  sortStage[removeExtraSymbols] = sortOrder;

  const cacheKey = `deals_stats:${query.searchTerm || ''}_${page}_${limit}_${sortBy}_${sortOrder}`;
  const getCachedData = await redisClient.get(cacheKey);

  // RETURN CACHE DATA
  if (getCachedData) {
    return JSON.parse(getCachedData);
  }

  // Search Match (Filtering)
  const searchMatch = {
    $or: [
      { title: { $regex: query.searchTerm || '', $options: 'i' } },
      { tags: { $regex: query.searchTerm || '', $options: 'i' } },
      {
        'shop.business_name': {
          $regex: query.searchTerm || '',
          $options: 'i',
        },
      },
      {
        'category.category_name': {
          $regex: query.searchTerm || '',
          $options: 'i',
        },
      },
    ],
  };

  const result = await DealModel.aggregate([
    // Step 2: Lookup related data (views_impressions, shops, and categories)
    {
      $lookup: {
        from: 'views_impressions',
        let: { dealId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ['$deal', '$$dealId'] },
            },
          },
          {
            $group: {
              _id: null,
              views: { $sum: { $cond: [{ $eq: ['$type', 'view'] }, 1, 0] } },
              impressions: { $sum: { $cond: [{ $eq: ['$type', 'impression'] }, 1, 0] } },
            },
          },
        ],
        as: 'analytics',
      },
    },

    // Lookup related shop data
    {
      $lookup: {
        from: 'shops',
        localField: 'shop',
        foreignField: '_id',
        as: 'shop',
      },
    },

    // Lookup related category data
    {
      $lookup: {
        from: 'categories',
        localField: 'category',
        foreignField: '_id',
        as: 'category',
      },
    },

    // Step 3: Unwind the shop and category
    { $unwind: { path: '$shop', preserveNullAndEmptyArrays: true } },
    { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },

    // Step 4: Add dynamic status field and analytics data
    {
      $addFields: {
        status: {
          $cond: [
            { $and: [{ $gt: ['$promotedUntil', new Date()] }, { $eq: ['$isPromoted', true] }] },
            'Active',
            {
              $cond: [
                { $and: [{ $eq: ['$isPromoted', false] }, { $lt: ['$promotedUntil', new Date()] }, { $ne: ['$activePromotion', null] }] },
                'Expired',
                {
                  $cond: [{ $eq: ['$activePromotion', null] }, 'New', 'Unknown'],
                },
              ],
            },
          ],
        },
        views: { $ifNull: [{ $first: '$analytics.views' }, 0] },
        impressions: { $ifNull: [{ $first: '$analytics.impressions' }, 0] },
      },
    },

    // Step 5: Create summary stage (total deals, views, impressions)
    {
      $facet: {
        summary: [
          {
            $group: {
              _id: null,
              totalDeals: { $sum: 1 },
              activeDeals: {
                $sum: {
                  $cond: [{ $gt: ['$promotedUntil', new Date()] }, 1, 0],
                },
              },
              totalViews: { $sum: '$views' },
              totalImpressions: { $sum: '$impressions' },
            },
          },
        ],

        // Step 6: Deals with pagination
        deals: [
          { $match: searchMatch },
          { $sort: sortStage },
          { $skip: skip },
          { $limit: limit },
          {
            $project: {
              title: 1,
              shop_id: '$shop._id',
              business_name: '$shop.business_name',
              category_name: '$category.category_name',
              views: 1,
              impressions: 1,
              status: 1,
              expiry: '$promotedUntil',
              createdAt: 1
            },
          },
        ],
      },
    },
  ]);

  // Get the summary and deals data
  const data = result[0];

  // Calculate total count (including the search filter)
  const total = data.summary.length > 0 ? data.summary[0].totalDeals : 0;

  const meta = {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  };

  const final_data = {
    meta,
    data: data.deals,
    summary: data.summary[0], // Including summary in the response
  };

  // Cache the result in Redis for future requests
  await redisClient.set(cacheKey, JSON.stringify(final_data), {
    EX: 60, // 1 min
  });

  // Return the data with pagination and summary
  return final_data;
};

// 5. DASHBOARD ANALYTICS TOTAL
const dashboardAnalyticsTotal = async () => {
  const cacheKey = `dashboard_analytics_total`;
  const getCachedData = await redisClient.get(cacheKey);

  // RETURN CACHED DATA
  if (getCachedData) {
    return JSON.parse(getCachedData);
  }

  const now = new Date();

  // LAST 30 DAYS
  const last30Days = new Date();
  last30Days.setDate(now.getDate() - 30);

  const [vendors, active_deals, revenue] = await Promise.all([
    // ACTIVE VENDORS
    Shop.countDocuments({
      shop_approval: ShopApproval.APPROVED,
    }),

    // ACTIVE DEALS
    DealModel.countDocuments({
      promotedUntil: { $gt: now },
    }),

    // LIFETIME REVENUE
    PaymentModel.aggregate([
      {
        $match: {
          payment_status: PaymentStatus.PAID,
        },
      },
      {
        $group: {
          _id: null,
          lifetimeRevenue: { $sum: '$amount' },
        },
      },
    ]),
  ]);

  // LAST 30 DAYS REVENUE
  const last30DaysRevenue = await PaymentModel.aggregate([
    {
      $match: {
        payment_status: PaymentStatus.PAID,
        createdAt: {
          $gte: last30Days,
          $lte: now,
        },
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: '$amount' },
      },
    },
  ]);

  const final_data = {
    active_vendors: vendors,
    active_deals,
    total_revenue: revenue[0]?.lifetimeRevenue || 0,
    last30Days_Revenue: last30DaysRevenue[0]?.total || 0,
  };

  // STORE DATA IN REDIS
  await redisClient.set(cacheKey, JSON.stringify(final_data), {
    EX: 3600, // 1 hour
  });

  // Return data
  return final_data;
};

// 6. LAST ONE YEAR REVENUE TREND
const getLastYearRevenueTrend = async () => {
  const cacheKey = `last_one_year_revenue_trend`;
  const getCachedData = await redisClient.get(cacheKey);

  if (getCachedData) {
    return JSON.parse(getCachedData);
  }

  const now = new Date();

  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - 11);
  startDate.setDate(1);

  const trend = await PaymentModel.aggregate([
    {
      $match: {
        payment_status: PaymentStatus.PAID,
        createdAt: {
          $gte: startDate,
          $lte: now,
        },
      },
    },
    {
      $group: {
        _id: {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' },
        },
        revenue: { $sum: '$amount' },
      },
    },
  ]);

  const monthNames = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];

  // convert aggregation result to map
  const revenueMap: Record<string, number> = {};
  trend.forEach((item) => {
    const key = `${item._id.year}-${item._id.month}`;
    revenueMap[key] = item.revenue;
  });

  const finalTrend = [];

  for (let i = 11; i >= 0; i--) {
    const d = new Date();
    d.setMonth(now.getMonth() - i);

    const year = d.getFullYear();
    const month = d.getMonth() + 1;

    const key = `${year}-${month}`;

    finalTrend.push({
      month: monthNames[month - 1],
      revenue: revenueMap[key] || 0,
    });
  }

  const final_data = finalTrend.reverse();

  // STORE DATA IN REDIS
  await redisClient.set(cacheKey, JSON.stringify(final_data), {
    EX: 600, // 10 min
  });

  return final_data;
};

// 7. LATEST TRANSACTION
const getLatestTransaction = async (query: Record<string, string>) => {
  // MAKE CACHE KEY
  const cacheKey = `latest_transaction:${query.join || ''}_${query.fields || ''}_${query.searchTerm || ''}_page_${query.page}_limit_${query.limit || ''}_sort_${query.sort || ''}`;

  // GET REDIS STORED DATA AND RETURN CACHE DATA
  const getCachedData = await redisClient.get(cacheKey);
  if (getCachedData) {
    return JSON.parse(getCachedData);
  }

  // DATABASE QUERY
  const queryBuilder = new QueryBuilder(
    PaymentModel.find({
      payment_status: PaymentStatus.PAID,
    }),
    query
  );

  const transactions = await queryBuilder
    .filter()
    .search(['transaction_id'])
    .select()
    .join()
    .sort()
    .paginate()
    .build();

  const meta = await queryBuilder.getMeta();

  const data = {
    meta,
    transactions,
  };

  // STORE DATA IN REDIS
  await redisClient.set(cacheKey, JSON.stringify(data), {
    EX: 600, // 10 min
  });

  return data;
};

// 8. SEND SYSTEM NOTIFICATION AND EMAIL
const sendNotificationAndEmail = async (
  payload: IDashBoardNotificationPayload
) => {
  const { title, message, channel, to } = payload;

  const allVendorsDeviceTokens = await User.find({}).select(
    'email deviceTokens'
  );
  const filterDeviceToken = allVendorsDeviceTokens.map(
    (deviceToken) => deviceToken.deviceTokens
  );
  const activeTokens = filterDeviceToken
    .flat()
    .filter((device) => device?.isActive)
    .map((device) => device.token);

  const emails = allVendorsDeviceTokens.map((deviceToken) => deviceToken.email);

  // 1. Send Push Notification if enabled
  if (channel.push) {
    if (to.active_vendors) {
      const notificationPayload = {
        title: title,
        body: message,
        type: NotificationType.SYSTEM,
        webUrl: `${env.FRONTEND_URL}/notification`,
        deepLink: `${env.DEEP_LINK}/notification`,
        data: {},
      };

      await NotificationModel.create(notificationPayload);

      const messagePayload = {
        tokens: activeTokens,
        notification: {
          title: title,
          body: message || '',
        },
        data: {
          type: NotificationType.SYSTEM,
          webUrl: `${env.FRONTEND_URL}/notification`,
          deepLink: `${env.DEEP_LINK}/notification`,
        },
      };

      await admin.messaging().sendEachForMulticast(messagePayload);
    }
  }

  // 2. Send Email if enabled
  if (channel.email) {
    await sendBulkEmails(emails, { title, message });
  }

  return {
    success: true,
    message: 'Notification process initiated',
  };
};

// EXPORT ALL THE SERVICE LAYER
export const dashboardServices = {
  dealsByCategoryStats,
  recentDealsStats,
  dealsStats,
  dashboardAnalyticsTotal,
  getLastYearRevenueTrend,
  allVendorsStats,
  getLatestTransaction,
  sendNotificationAndEmail,
};
