import { StatusCodes } from 'http-status-codes';
import AppError from '../../errorHelpers/AppError';
import User from '../user/user.model';
import bcrypt from 'bcrypt';
import { randomOTPGenerator } from '../../utils/randomOTPGenerator';
import { redisClient } from '../../config/redis.config';
import { sendEmail } from '../../utils/sendMail';
import { IsActiveUser } from '../user/user.interface';
import env from '../../config/env';
import jwt, { JwtPayload, SignOptions } from 'jsonwebtoken';

// CHANGE PASSWORD
const changePasswordService = async (
  userId: string,
  oldPassword: string,
  newPassword: string
) => {
  const user = await User.findById(userId).select('+password');
  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, 'User not found!');
  }

  if (!oldPassword) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'Please provide your old password!'
    );
  }

  if (!newPassword) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'Please provide your new password!'
    );
  }

  const matchPassword = await bcrypt.compare(
    oldPassword,
    user.password as string
  );
  if (!matchPassword) {
    throw new AppError(StatusCodes.BAD_REQUEST, "Password doesn't matched!");
  }

  //   console.log(newPassword);

  user.password = newPassword;
  await user.save();

  return null;
};

// FORGET PASSWORD
const forgetPasswordService = async (email: string) => {
  const user = await User.findOne({ email });
  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, 'User not found!');
  }

  if (user.isDeleted) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'User was deleted!');
  }

  if (
    user.isActive === IsActiveUser.INACTIVE ||
    user.isActive === IsActiveUser.BLOCKED
  ) {
    throw new AppError(StatusCodes.BAD_REQUEST, `User is ${user.isActive}`);
  }

  const otp = randomOTPGenerator(100000, 999999).toString(); // Generate OTP
  const hashedOTP = await bcrypt.hash(otp, Number(env.BCRYPT_SALT_ROUND)); // Hashed OTP

  // CACHED OTP TO REDIS
  await redisClient.set(`otp:${user.email}`, hashedOTP, { EX: 120 }); // 2 min

  // SENDING OTP TO EMAIL
  await sendEmail({
    to: user.email,
    subject: 'LinkUp:Password Reset OTP',
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
    throw new AppError(StatusCodes.BAD_REQUEST, 'Email required!');
  }

  // CHECK USER
  const user = await User.findOne({ email });
  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, 'No user found!');
  }

  if (!otp || otp.length < 6) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'Wrong OTP!');
  }

  // OTP MATCHING PART
  const getOTP = await redisClient.get(`otp:${email}`);

  if (!getOTP) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'OTP has expired!');
  }

  // Matching otp
  const isOTPMatched = await bcrypt.compare(otp, getOTP); // COMPARE WITH OTP
  if (!isOTPMatched) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'OTP is not matched!');
  }

  const jwtPayload = { email, verified: true };
  const jwtToken =  jwt.sign(jwtPayload, env.OTP_JWT_ACCESS_SECRET, {
    expiresIn: env.OTP_JWT_ACCESS_EXPIRATION,
  } as SignOptions);

  // DELETED OTP AFTER USED
  await redisClient.del(`otp:${email}`);
  return jwtToken;
};

// RESET PASSWORD
const resetPasswordService = async (token: string, newPassword: string) => {
  if (!token) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'Token must required!');
  }

  const verifyToken = jwt.verify(
    token,
    env.OTP_JWT_ACCESS_SECRET
  ) as JwtPayload;

  

  if (!verifyToken) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid token or expired!');
  }

  if (!verifyToken?.verified) {
    throw new AppError(StatusCodes.BAD_REQUEST, "OTP wasn't verfied yet");
  }

  // CHECK USER
  const user = await User.findOne({ email: verifyToken?.email });
  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, 'No user found!');
  }

  // SET NEW PASSWORD
  user.password = newPassword;
  await user.save();

  return null;
};

export const authService = {
  changePasswordService,
  forgetPasswordService,
  verifyForgetPasswordOTPService,
  resetPasswordService
};
