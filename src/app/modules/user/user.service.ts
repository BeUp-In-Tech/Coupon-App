import { StatusCodes } from 'http-status-codes';
import AppError from '../../errorHelpers/AppError';
import { IAuthProvider, IFcmToken, IUser, Role } from './user.interface';
import User from './user.model';
import { JwtPayload } from 'jsonwebtoken';
import { randomOTPGenerator } from '../../utils/randomOTPGenerator';
import { redisClient } from '../../config/redis.config';
import { sendEmail } from '../../utils/sendMail';
import { Types } from 'mongoose';
import { removeTokenFromOtherUsers } from '../../utils/removeToken';
import { Shop } from '../shop/shop.model';
import { createUserTokens } from '../../utils/user.tokens';

// 1. CREATE VENDOR SERVICE
const registerUserService = async (payload: IUser) => {
  const { email, ...rest } = payload;

  const isVendor = await User.findOne({ email });
  if (isVendor) {
    throw new AppError(400, 'User aleready exist. Please login!');
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
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "You can't change your password from here"
    );
  }

  // Ensure that role modification is only allowed for admin users
  if (payload.role) {
    if (user.role !== Role.ADMIN) {
      throw new AppError(StatusCodes.FORBIDDEN, "You can't change your role");
    }
    // Validate that the provided role is a valid role
    if (!Object.values(Role).includes(payload.role)) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid role');
    }
  }

  // Field whitelisting
  Object.keys(payload).forEach((key) => {
    if (!ALLOWED_FIELDS.includes(key)) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        `Field '${key}' is not allowed to be updated`
      );
    }
  });

  // Update user
  const update = await User.findByIdAndUpdate(user.userId, payload, {
    runValidators: true,
    new: true,
  });

  // INVALID OR CLEAR OLD DATA WHEN USER UPDATE HIS DATA
  redisClient.del(`user_me:${update?._id}`);

  // RETURN UPDATED DATA
  return update;
};


// 3. GET ME
const getMeSerevice = async (userId: string) => {
  const getRedisData = await redisClient.get(`user_me:${userId}`);
  if (getRedisData) {   
    return JSON.parse(getRedisData);
  }
  
  const _user = await User.findById(userId).select('-password').lean();
  if (!_user) {
    throw new AppError(StatusCodes.NOT_FOUND, 'User not found');
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

  redisClient.del(`user_me:${userId}`);

  // Store User into redis
  redisClient.set(`user_me:${userId}`, JSON.stringify(user), {
    EX: 10 * 60 // 10 min
  });

  return user;
};


// 4. SEND VERFICATION OTP
const sendVerificationOtpService = async (email: string) => {
  const user = (await User.findOne({ email }).select(
    'user_name email'
  )) as Partial<IUser>;

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

  return null;
};


//5. VERIFY USER PROFILE
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
      'OTP has expired or not found. Please request a new OTP.'
    );
  }

  // Check if OTP matches
  if (Number(storedOtp) !== otp) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'Invalid OTP. Please try again.'
    );
  }

  user.isVerified = true;
  await user.save();

  // OTP is valid, delete OTP from Redis
  await redisClient.del(`otp:${user.email}`);
  return null;
};


// 6. REGISTER USER FCM TOKEN
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


// 7. UNREGISTER PUSH
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


// 8. LIST OF LOGGED IN DEVICES
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
  getMeSerevice,
  sendVerificationOtpService,
  verifyUserProfileService,
  registerPushTokenService,
  unregisterPushTokenService,
  listMyDevicesService,
};
