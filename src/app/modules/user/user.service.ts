import { StatusCodes } from 'http-status-codes';
import AppError from '../../errorHelpers/AppError';
import { IAuthProvider, IFcmToken, IUser, Role } from './user.interface';
import User from './user.model';
import { JwtPayload } from 'jsonwebtoken';
import { randomOTPGenerator } from '../../utils/randomOTPGenerator';
import { redisClient } from '../../config/redis.config';
import { sendEmail } from '../../utils/sendMail';
import mongoose, { Types } from 'mongoose';
import { removeTokenFromOtherUsers } from '../../utils/removeToken';
import { Shop } from '../shop/shop.model';
import { createUserTokens } from '../../utils/user.tokens';
import { invalidateAllMachineryCache } from '../../utils/deleteCachedData';
import { Location as OutletModel } from '../location/location.model';
import { DealModel } from '../deal/deal.model';
import { Promotion } from '../promotion/promotion.model';
import { PaymentModel } from '../payment/payment.model';
import { PaymentStatus } from '../payment/payment.interface';
import { NotificationModel } from '../notification/notification.model';
import { Views_Impressions } from '../views_impression/vi.model';
import { addImageDeleteJob } from '../../utils/imageDeleteJobAdd';
import { LoggerModule, userLogger } from '../../utils/logger/logger.child';


// 1. CREATE VENDOR SERVICE
const registerUserService = async (payload: IUser) => {
  const { email, ...rest } = payload;

  const isVendor = await User.findOne({ email });
  if (isVendor) {
    throw new AppError(400, 'User already exist. Please login!', LoggerModule.USER);
  }

  // Save User Auth
  const authUser: IAuthProvider = {
    provider: 'credentials',
    providerId: payload.email as string,
  };

  const userPayload = {
    email,
    auths: [authUser],
    ...rest,
  };

  // Create user
  const createUser = await User.create(userPayload);

  // Generate tokens
  const tokens = await createUserTokens(createUser)

  // Return
  return {tokens, createUser};
};

// 2. UPDATE USER
const updateUserService = async (user: JwtPayload, payload: Partial<IUser>) => {
  // Allowed field to update data
  const ALLOWED_FIELDS = ['user_name'];

  // Ensure that the user is not attempting to change their password
  if (payload.password) {
    throw new AppError(StatusCodes.BAD_REQUEST, "You can't change your password from here", LoggerModule.USER);
  }

  // Ensure that role modification is only allowed for admin users
  if (payload.role) {
    if (user.role !== Role.ADMIN) {
      throw new AppError(StatusCodes.FORBIDDEN, "You can't change your role", LoggerModule.USER);
    }
    // Validate that the provided role is a valid role
    if (!Object.values(Role).includes(payload.role)) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid role', LoggerModule.USER);
    }
  }

  // Field whitelisting
  Object.keys(payload).forEach((key) => {
    if (!ALLOWED_FIELDS.includes(key)) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        `Field '${key}' is not allowed to be updated`,
        LoggerModule.USER
      );
    }
  });

  // Update user
  const update = await User.findByIdAndUpdate(user.userId, payload, {
    runValidators: true,
    new: true,
  });

  // INVALID OR CLEAR OLD DATA WHEN USER UPDATE HIS DATA
  await redisClient.del(`user_me:${update?._id}`);

  if (payload.user_name) {
    await invalidateAllMachineryCache('all_vendors_dashboard:*');
  }

  // RETURN UPDATED DATA
  return update;
};


// 3. GET ME
const getMeService = async (userId: string) => {
  const getRedisData = await redisClient.get(`user_me:${userId}`);
  if (getRedisData) {   
    return JSON.parse(getRedisData);
  }
  
  const _user = await User.findById(userId).select('-password').lean();
  if (!_user) {
    throw new AppError(StatusCodes.NOT_FOUND, 'User not found', LoggerModule.USER);
  }
  

  const isShopExist = await Shop.findOne({ vendor: _user._id }).lean().select("_id");
  
  const user = {
    _id: _user._id,
    user_name: _user.user_name,
    email: _user.email,
    isVerified: _user.isVerified,
    role: _user.role,
    isActive: _user.isActive,
    deviceTokens: _user.deviceTokens,
    isShopCreated: isShopExist ? true : false
  }

  // Store User into redis
  await redisClient.set(`user_me:${userId}`, JSON.stringify(user), {
    EX: 10 * 60 // 10 min
  });

  return user;
};


// 4. SEND VERIFICATION OTP
const sendVerificationOtpService = async (email: string, auth: JwtPayload) => {

  
  if (email !== auth.email) {
    throw new AppError(StatusCodes.FORBIDDEN, "Email not matched", LoggerModule.USER);
  }

  const user = (await User.findOne({ email }).select(
    'user_name email isVerified'
  ).lean()) as Partial<IUser>;


  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, 'User not found', LoggerModule.USER);
  }
  

  if (user.isVerified) {
    throw new AppError(StatusCodes.BAD_REQUEST, "Profile already verified!", LoggerModule.USER)
  }

  // Generate OTP
  const otp = randomOTPGenerator(100000, 999999);

  // Store OTP in Redis with expiration (e.g., 5 minutes)
  await redisClient.set(`otp:${user.email}`, otp, {
    EX: 300,
  });

  // Prepare email template data
  const templateData = {
    otp: otp,
    name: user.user_name,
    expirationTime: '5 minutes',
  };

  // Send OTP email
  await sendEmail({
    to: user.email as string,
    subject: 'Profile Verification OTP',
    templateName: 'otp',
    templateData: templateData,
  });

  userLogger.info(`Verification OTP sent`);

  // Return success message
  return null;
};


// 5. VERIFY USER PROFILE
const verifyUserProfileService = async (email: string, otp: number) => {
  const user = await User.findOne({ email });
  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, 'User not found');
  }

  // Retrieve OTP from Redis
  const storedOtp = await redisClient.get(`otp:${user.email}`);

  if (!storedOtp) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'OTP has expired or not found. Please request a new OTP.',
      LoggerModule.USER
    );
  }

  // Check if OTP matches
  if (Number(storedOtp) !== otp) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'Invalid OTP. Please try again.',
      LoggerModule.USER
    );
  }

  user.isVerified = true;
  await user.save();

  // OTP is valid, delete OTP from Redis
  await redisClient.del(`otp:${user.email}`);
  await redisClient.del(`user_me:${user._id.toString()}`);
  return null;
};


// 6. DELETE USER ACCOUNT
const deleteUserAccount = async (authUser: JwtPayload) => {
  if (!authUser?.userId) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid user token payload', LoggerModule.USER);
  }

  const userId = new Types.ObjectId(authUser.userId);

  const user = await User.findById(userId).select('_id email role').lean();
  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, 'User not found', LoggerModule.USER);
  }

  // Vendor-specific data cleanup should only run for vendor accounts.
  const isVendor = user.role === Role.VENDOR;

  const shops = isVendor
    ? await Shop.find({ vendor: userId }).select('_id business_logo').lean()
    : [];
  const shopIds = shops.map((shop) => shop._id);

  const deals = isVendor
    ? await DealModel.find({
      $or: [{ user: userId }, ...(shopIds.length ? [{ shop: { $in: shopIds } }] : [])],
    })
      .select('_id user shop images coupon_option')
      .lean()
    : [];
  const dealIds = deals.map((deal) => deal._id);

  // Safety guard: every selected deal must be owned by this vendor.
  if (isVendor && deals.length) {
    const shopIdSet = new Set(shopIds.map((id) => id.toString()));
    const hasUnauthorizedDeal = deals.some((deal) => {
      const isOwnerByUser = deal.user?.toString() === userId.toString();
      const isOwnerByShop = deal.shop && shopIdSet.has(deal.shop.toString());
      return !isOwnerByUser && !isOwnerByShop;
    });

    if (hasUnauthorizedDeal) {
      throw new AppError(
        StatusCodes.FORBIDDEN,
        'Unauthorized deal ownership detected. Account deletion stopped.',
        LoggerModule.USER
      );
    }
  }


  // CLOUDINARY IMAGES COLLECT
  const cloudinaryHost = 'res.cloudinary.com';
  const isCloudinaryUrl = (url?: string) =>
    typeof url === 'string' && url.includes(cloudinaryHost);

  const cloudinaryImageSet = new Set<string>();

  shops.forEach((shop) => {
    if (isCloudinaryUrl(shop.business_logo)) {
      cloudinaryImageSet.add(shop.business_logo);
    }
  });

  deals.forEach((deal) => {
    (deal.images || []).forEach((image) => {
      if (isCloudinaryUrl(image)) {
        cloudinaryImageSet.add(image);
      }
    });

    if (isCloudinaryUrl(deal.coupon_option?.qr)) {
      cloudinaryImageSet.add(deal.coupon_option?.qr as string);
    }

    if (isCloudinaryUrl(deal.coupon_option?.upc)) {
      cloudinaryImageSet.add(deal.coupon_option?.upc as string);
    }
  });

  // PAYMENT DELETE QUERY
  const paymentDeleteQuery = isVendor
    ? {
      $or: [
        { user: userId },
        ...(dealIds.length ? [{ deal: { $in: dealIds } }] : []),
      ],
    }
    : { user: userId };


  // PROMOTION DELETE QUERY
  const promotionDeleteQuery = isVendor
    ? {
      $or: [
        { user: userId },
        ...(dealIds.length ? [{ deal: { $in: dealIds } }] : []),
        ...(shopIds.length ? [{ shop: { $in: shopIds } }] : []),
      ],
    }
    : { user: userId };

    // RESOLVE ALL PROMISE
  const [paidTransactions, allTransactions] = await Promise.all([
    PaymentModel.countDocuments({
      ...paymentDeleteQuery,
      payment_status: PaymentStatus.PAID,
    }),
    PaymentModel.countDocuments(paymentDeleteQuery),
  ]);

  const session = await mongoose.startSession();

  const deleteSummary = {
    user: 0,
    shops: 0,
    outlets: 0,
    deals: 0,
    promotions: 0,
    notifications: 0,
    views_impressions_by_deals: 0,
    views_impressions_by_user: 0,
    payments_deleted: 0,
    payments_kept: 0,
  };

  try {
    session.startTransaction();

    // DELETE DEALS
    const deleteDealResult = isVendor && dealIds.length
      ? await DealModel.deleteMany({ _id: { $in: dealIds } }, { session })
      : { deletedCount: 0 };
    deleteSummary.deals = deleteDealResult.deletedCount ?? 0;

    // DELETE VIEWS
    const deleteDealViewsResult = isVendor && dealIds.length
      ? await Views_Impressions.deleteMany({ deal: { $in: dealIds } }, { session })
      : { deletedCount: 0 };
    deleteSummary.views_impressions_by_deals =
      deleteDealViewsResult.deletedCount ?? 0;

    // DELETE USER VIEW
    const deleteUserViewsResult = await Views_Impressions.deleteMany(
      { user: userId },
      { session }
    );
    deleteSummary.views_impressions_by_user =
      deleteUserViewsResult.deletedCount ?? 0;

    // DELETE NOTIFICATIONS OF THE USER
    const deleteNotificationResult = await NotificationModel.deleteMany(
      { user: userId },
      { session }
    );
    deleteSummary.notifications = deleteNotificationResult.deletedCount ?? 0;

    const deletePromotionResult = await Promotion.deleteMany(promotionDeleteQuery, {
      session,
    });
    deleteSummary.promotions = deletePromotionResult.deletedCount ?? 0;

    // Transaction history is always preserved.
    deleteSummary.payments_deleted = 0;
    deleteSummary.payments_kept = allTransactions;

    if (isVendor && shopIds.length) {
      const deleteOutletResult = await OutletModel.deleteMany(
        { shop: { $in: shopIds } },
        { session }
      );
      deleteSummary.outlets = deleteOutletResult.deletedCount ?? 0;

      const deleteShopResult = await Shop.deleteMany(
        { _id: { $in: shopIds } },
        { session }
      );
      deleteSummary.shops = deleteShopResult.deletedCount ?? 0;
    }

    const deleteUserResult = await User.deleteOne({ _id: userId }, { session });
    deleteSummary.user = deleteUserResult.deletedCount ?? 0;

    await session.commitTransaction();
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
  
  const cloudinaryImages = Array.from(cloudinaryImageSet);
  let imageDeleteQueueStatus: 'QUEUED' | 'QUEUE_FAILED' | 'NO_IMAGE' = 'NO_IMAGE';

  if (cloudinaryImages.length) {
    try {
      await addImageDeleteJob(cloudinaryImages, { throwOnError: true });
      imageDeleteQueueStatus = 'QUEUED';
    } catch {
      imageDeleteQueueStatus = 'QUEUE_FAILED';
    }
  }

  

  await Promise.all([
    redisClient.del(`user_me:${userId.toString()}`),
    redisClient.del(`otp:${user.email}`),
    redisClient.del(`shop:${userId.toString()}`),
    redisClient.del(`dashboard_analytics_total`),
    redisClient.del(`last_one_year_revenue_trend`),
    redisClient.del(`deals_by_category_stats`),
    invalidateAllMachineryCache(`my_deals-userId:${userId.toString()}:*`),
    invalidateAllMachineryCache('recent_deals:*'),
    invalidateAllMachineryCache('deals_stats:*'),
    invalidateAllMachineryCache('all_vendors_dashboard:*'),
    invalidateAllMachineryCache('latest_transaction:*'),
    invalidateAllMachineryCache('machinery:*'),
    invalidateAllMachineryCache('machinery:all:*'),
  ]);

  return {
    userId: userId.toString(),
    imageDeleteQueueStatus,
    transactionSummary: {
      paidTransactions,
      totalTransactions: allTransactions,
      deletedTransactions: deleteSummary.payments_deleted,
      keptTransactions: deleteSummary.payments_kept,
    },
    cloudinaryImages,
    deleteSummary,
  };
};


// 7. REGISTER USER FCM TOKEN
const registerPushTokenService = async (
  _userId: string,
  payload: IFcmToken
) => {
  const userId = new Types.ObjectId(_userId);
  const { token, platform, deviceId, deviceName } = payload;

  await removeTokenFromOtherUsers(token, _userId);

  // 1) Try update existing device entry (by deviceId)
  const updateResult = await User.updateOne(
    { _id: userId, 'deviceTokens.deviceId': deviceId },
    {
      $set: {
        'deviceTokens.$.token': token,
        'deviceTokens.$.platform': platform,
        'deviceTokens.$.deviceName': deviceName || '',
        'deviceTokens.$.lastSeenAt': new Date(),
        'deviceTokens.$.isActive': true,
      },
    }
  );

  // 2) If no entry exists for this deviceId, push new
  if (updateResult.matchedCount === 0) {
    await User.updateOne(
      { _id: userId },
      {
        $push: {
          deviceTokens: {
            token,
            platform,
            deviceId,
            deviceName: deviceName || '',
            lastSeenAt: new Date(),
            isActive: true,
          },
        },
      }
    );
  }

  return null;
};


// 8. UNREGISTER PUSH
const unregisterPushTokenService = async (
  deviceId: string,
  _userId: string
) => {
  const userId = new Types.ObjectId(_userId);

  await User.updateOne(
    { _id: userId, 'deviceTokens.deviceId': deviceId },
    {
      $set: {
        'deviceTokens.$.isActive': false,
        'deviceTokens.$.lastSeenAt': new Date(),
      },
    }
  );

  return null;
};


// 9. LIST OF LOGGED IN DEVICES
const listMyDevicesService = async (_userId: string) => {
  const userId = new Types.ObjectId(_userId);

  const user = await User.findById(userId).select('deviceTokens').lean();
  const devices = user?.deviceTokens || [];

  // optional: show active first
  devices.sort((a, b) => Number(b.isActive) - Number(a.isActive));

  return devices;
};

export const userServices = {
  registerUserService,
  updateUserService,
  getMeService,
  sendVerificationOtpService,
  verifyUserProfileService,
  deleteUserAccount,
  registerPushTokenService,
  unregisterPushTokenService,
  listMyDevicesService,
};
