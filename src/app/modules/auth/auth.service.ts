import { StatusCodes } from 'http-status-codes';
import AppError from '../../errorHelpers/AppError';
import User from '../user/user.model';
import bcrypt from 'bcrypt';
import { randomOTPGenerator } from '../../utils/randomOTPGenerator';
import { redisClient } from '../../config/redis.config';
import { sendEmail } from '../../utils/sendMail';
import { IsActiveUser, Role } from '../user/user.interface';
import env from '../../config/env';
import jwt, { JwtPayload, SignOptions } from 'jsonwebtoken';
import { verifyToken } from '../../utils/jwt';
import { createUserTokens } from '../../utils/user.tokens';
import axios from 'axios';
import qs from 'qs';
import { AppleTokenExchangeResponse, generateAppleClientSecret, verifyAppleIdToken } from './auth.utility';
import { OAuth2Client } from 'google-auth-library';
import { LoggerModule } from '../../utils/logger/logger.child';


// CHANGE PASSWORD
const changePasswordService = async (
  userId: string,
  oldPassword: string,
  newPassword: string
) => {

  if (oldPassword === newPassword) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'Your new password must be different from old password!', LoggerModule.AUTH);
  }

  const user = await User.findById(userId).select('+password');
  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, 'User not found!', LoggerModule.AUTH);
  }

  if (!oldPassword) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'Please provide your old password!',
       LoggerModule.AUTH
    );
  }

  if (!newPassword) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'Please provide your new password!',
      LoggerModule.AUTH
    );
  }

  const matchPassword = await bcrypt.compare(
    oldPassword,
    user.password as string
  );
  if (!matchPassword) {
    throw new AppError(StatusCodes.BAD_REQUEST, "Password doesn't matched!", LoggerModule.AUTH);
  }

  user.password = newPassword;
  await user.save();

  return null;
};

// FORGET PASSWORD
const forgetPasswordService = async (email: string) => {
  const user = await User.findOne({ email });
  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, 'User not found!', LoggerModule.AUTH);
  }

  if (user.isDeleted) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'User was deleted!', LoggerModule.AUTH);
  }

  if (
    user.isActive === IsActiveUser.INACTIVE ||
    user.isActive === IsActiveUser.BLOCKED
  ) {
    throw new AppError(StatusCodes.BAD_REQUEST, `User is ${user.isActive}`, LoggerModule.AUTH);
  }

  const otp = randomOTPGenerator(100000, 999999).toString(); // Generate OTP
  const hashedOTP = await bcrypt.hash(otp, Number(env.BCRYPT_SALT_ROUND)); // Hashed OTP

  // CACHED OTP TO REDIS
  await redisClient.set(`otp:${user.email}`, hashedOTP, { EX: 120 }); // 2 min

  // SENDING OTP TO EMAIL
  await sendEmail({
    to: user.email,
    subject: 'Yepp Ads:Password Reset OTP',
    templateName: 'forgetPassword_otp_send',
    templateData: {
      name: user.user_name,
      expirationTime: 2,
      otp,
    },
  });

  return null;
};

// VERIFY RESET PASSWORD OTP
const verifyForgetPasswordOTPService = async (email: string, otp: string) => {
  if (!email) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'Email required!', LoggerModule.AUTH);
  }

  // CHECK USER
  const user = await User.findOne({ email });
  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, 'No user found!', LoggerModule.AUTH);
  }

  if (!otp || otp.length < 6) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'Wrong OTP!', LoggerModule.AUTH);
  }

  // OTP MATCHING PART
  const getOTP = await redisClient.get(`otp:${email}`);

  if (!getOTP) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'OTP has expired!', LoggerModule.AUTH);
  }

  // Matching otp
  const isOTPMatched = await bcrypt.compare(otp, getOTP); // COMPARE WITH OTP
  if (!isOTPMatched) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'OTP is not matched!', LoggerModule.AUTH);
  }

  const jwtPayload = { email, verified: true };
  const jwtToken = jwt.sign(jwtPayload, env.OTP_JWT_ACCESS_SECRET, {
    expiresIn: env.OTP_JWT_ACCESS_EXPIRATION,
  } as SignOptions);

  // DELETED OTP AFTER USED
  await redisClient.del(`otp:${email}`);
  return jwtToken;
};

// RESET PASSWORD
const resetPasswordService = async (token: string, newPassword: string) => {
  if (!token) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'Token must required!', LoggerModule.AUTH);
  }

  const verifyToken = jwt.verify(
    token,
    env.OTP_JWT_ACCESS_SECRET
  ) as JwtPayload;

  if (!verifyToken) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid token or expired!', LoggerModule.AUTH);
  }

  if (!verifyToken?.verified) {
    throw new AppError(StatusCodes.BAD_REQUEST, "OTP wasn't verified yet", LoggerModule.AUTH);
  }

  // CHECK USER
  const user = await User.findOne({ email: verifyToken?.email });
  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, 'No user found!', LoggerModule.AUTH);
  }

  // SET NEW PASSWORD
  user.password = newPassword;
  await user.save();

  return null;
};

// GET NEW ACCESS TOKEN
const getNewAccessTokenService = async (refreshToken: string) => {
  if (!refreshToken) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Refresh token needed!', LoggerModule.AUTH);
  }

  const tokenVerify = verifyToken(
    refreshToken,
    env.JWT_REFRESH_SECRET
  ) as JwtPayload; // VERIFY TOKEN
  const isUserExists = await User.findById(tokenVerify.userId as string); // FIND USER BY ID

  if (!isUserExists) {
    throw new AppError(StatusCodes.BAD_REQUEST, "User Doesn't Exist", LoggerModule.AUTH);
  }

  if (
    isUserExists.isActive === IsActiveUser.BLOCKED ||
    isUserExists.isActive === IsActiveUser.INACTIVE
  ) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'The User "blocked" or "inactive"',
      LoggerModule.AUTH
    );
  }

  if (isUserExists.isDeleted) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'The user was "deleted"', LoggerModule.AUTH);
  }

  const jwtPayload = {
    _id: isUserExists?._id,
    email: isUserExists?.email,
    role: isUserExists?.role,
  };

  const userToken = await createUserTokens(jwtPayload); // Jsonwebtoken

  return {
    newAccessToken: userToken.accessToken,
    newRefreshToken: userToken.refreshToken,
  };
};

// =============================APPLE LOGIN HANDLING=========================
const appleLoginService = async (code: string, user_name: string, email: string) => {

  const authorizationCode =  code;
  if (!authorizationCode) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'Apple authorization code is required', LoggerModule.AUTH);
  }

  const clientId = env.APPLE_IOS_CLIENT_ID;
  if (![env.APPLE_IOS_CLIENT_ID, env.APPLE_WEB_CLIENT_ID].includes(clientId)) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid Apple client id', LoggerModule.AUTH);
  }

  const clientSecret = await generateAppleClientSecret(clientId);
  const tokenPayload: Record<string, string> = {
    grant_type: 'authorization_code',
    code: authorizationCode,
    client_id: clientId,
    client_secret: clientSecret,
  };

  if (clientId === env.APPLE_WEB_CLIENT_ID) {
    tokenPayload.redirect_uri = env.APPLE_WEB_REDIRECT_URI;
  }

  let tokenResponse: AppleTokenExchangeResponse;
  try {
    const tokenResp = await axios.post<AppleTokenExchangeResponse>(
      'https://appleid.apple.com/auth/token',
      qs.stringify(tokenPayload),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    tokenResponse = tokenResp.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const appleError = (error.response?.data as { error?: string })?.error;
      const message = appleError
        ? `Apple token exchange failed: ${appleError}`
        : 'Apple token exchange failed';
      throw new AppError(StatusCodes.UNAUTHORIZED, message, LoggerModule.AUTH);
    }
    throw error;
  }


  const identityToken = tokenResponse?.id_token as string;
  if (!identityToken) {
    throw new AppError(
      StatusCodes.UNAUTHORIZED,
      'Apple identity token is missing after code exchange',
      LoggerModule.AUTH
    );
  }

  // Verify Apple identity token signature & claims
  const payload = await verifyAppleIdToken(identityToken, clientId);

  // payload.sub is Apple unique user ID
  const appleUserId = payload?.sub;
  if (!appleUserId) {
    throw new AppError(StatusCodes.UNAUTHORIZED, 'Apple user id not found in token', LoggerModule.AUTH);
  }

  const userEmail = (payload?.email || email || '').toLowerCase().trim();

  let user = await User.findOne({
    auths: {
      $elemMatch: {
        provider: 'apple',
        providerId: appleUserId,
      },
    },
  });

  if (!user && userEmail) {
    user = await User.findOne({ email: userEmail });
    if (user) {
      const alreadyLinked = user.auths?.some(
        (provider) =>
          provider.provider === 'apple' && provider.providerId === appleUserId
      );

      if (!alreadyLinked) {
        user.auths = user.auths || [];
        user.auths.push({
          provider: 'apple',
          providerId: appleUserId,
        });
      }
      user.isVerified = true;
      await user.save();
    }
  }

  if (!user) {
    if (!userEmail) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        "Apple didn't return email. Please share email on first Apple sign-in and retry.",
        LoggerModule.AUTH
      );
    }

    const userNameFromRequest = typeof user_name === 'string' ? user_name.trim() : '';
    const fallbackName = userEmail.split('@')[0] || 'Apple User';

    user = await User.create({
      user_name: userNameFromRequest || fallbackName,
      email: userEmail,
      role: Role.VENDOR,
      isVerified: true,
      auths: [
        {
          provider: 'apple',
          providerId: appleUserId,
        },
      ],
    });
  }

  if (user.isDeleted) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'User was deleted!', LoggerModule.AUTH);
  }

  if (
    user.isActive === IsActiveUser.INACTIVE ||
    user.isActive === IsActiveUser.BLOCKED
  ) {
    throw new AppError(StatusCodes.BAD_REQUEST, `User is ${user.isActive}`, LoggerModule.AUTH);
  }

  const userTokens = await createUserTokens({
    _id: user._id,
    email: user.email,
    role: user.role,
  } as JwtPayload);


  return {
    accessToken: userTokens.accessToken,
    refreshToken: userTokens.refreshToken,
    user: {
      _id: user._id,
      user_name: user.user_name,
      email: user.email,
      role: user.role,
    },
  };
};

// =============================GOOGLE REGISTER/LOGIN HANDLING FOR APPLE (NO REDIRECT SYSTEM)===============
const googleClient = new OAuth2Client();

const googleAuthSystem = async (payload: { id_token: string }) => {
  const { id_token } = payload;

  if (!id_token) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'Google idToken is required', LoggerModule.AUTH);
  }

  const ticket = await googleClient.verifyIdToken({
    idToken: id_token,
    audience: process.env.GOOGLE_WEB_CLIENT_ID,
  });

  const googlePayload = ticket.getPayload();

  if (!googlePayload) {
    throw new AppError(StatusCodes.UNAUTHORIZED, 'Invalid Google token', LoggerModule.AUTH);
  }

  const {
    sub,
    email,
    email_verified,
    name,
  } = googlePayload;

  if (!email || !email_verified) {
    throw new AppError(StatusCodes.UNAUTHORIZED, 'Google email is not verified', LoggerModule.AUTH);
  }

  // Important:
  // Use `sub` as googleId. Do not use email as the permanent Google identifier.
  // Find or create user by googleId/sub.
  let user = await User.findOne({ email });

  const auth = [
        {
          provider: 'google',
          providerId: sub,
        },
      ];

  if (!user) {
    user = await User.create({
      email,
      user_name: name,
      auths: auth,
      role: Role.VENDOR,
      isVerified: true,
    });
  }

  // Generate your own JWT tokens
  const tokens = await createUserTokens(user);


  return {
    user,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  };
};

export const authService = {
  changePasswordService,
  forgetPasswordService,
  verifyForgetPasswordOTPService,
  resetPasswordService,
  getNewAccessTokenService,
  appleLoginService,
  googleAuthSystem
};
