import { StatusCodes } from "http-status-codes";
import AppError from "../../errorHelpers/AppError";
import { IAuthProvider, IUser, Role,   } from "./user.interface";
import User from "./user.model";
import { JwtPayload } from "jsonwebtoken";
import { randomOTPGenerator } from "../../utils/randomOTPGenerator";
import { redisClient } from "../../config/redis.config";
import { sendEmail } from "../../utils/sendMail";


// CREATE VENDOR SERVICE
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
  const creatUser = await User.create(userPayload); 
  return creatUser;
}

// UPDATE USER
const updateUserService = async (user: JwtPayload, payload: Partial<IUser>) => {

  // Allowed field to update data
  const ALLOWED_FIELDS = ['user_name'];

  // Ensure that the user is not attempting to change their password
  if (payload.password) {
    throw new AppError(StatusCodes.BAD_REQUEST, "You can't change your password from here");
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

    Object.keys(payload).forEach((key) => {
      if (!ALLOWED_FIELDS.includes(key)) {
        throw new AppError(StatusCodes.BAD_REQUEST, `Field '${key}' is not allowed to be updated`);
      }
    });
 
  
  const update = await User.findByIdAndUpdate(user.userId, payload, {runValidators: true, new: true});

  return update;
};


// SEND VERFICATION OTP
const sendVerificationOtpService = async (email: string) => {
  const  user  = await User.findOne({ email }).select("user_name email") as Partial<IUser>;

   // Generate OTP
  const otp = randomOTPGenerator(100000, 999999);

  // Store OTP in Redis with expiration (e.g., 5 minutes)
  await redisClient.set(`otp:${user.email}`, otp, {
    EX: 300
  }); 

  // Prepare email template data
  const templateData = {
    otp: otp,
    name: user.user_name,
    expirationTime: '5 minutes',  
  };

  // Send OTP email
    await sendEmail({
      to:  user.email as string,
      subject: 'Profile Verification OTP',
      templateName: 'otp',
      templateData: templateData
    });

  return null;
}


const verifyUserProfileService = async (email: string, otp: number) => {
  const user = await User.findOne({ email });
  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, "User not found");
  }

   // Retrieve OTP from Redis
  const storedOtp = await redisClient.get(`otp:${user.email}`);

  if (!storedOtp) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'OTP has expired or not found. Please request a new OTP.');
  }

  // Check if OTP matches
  if (Number(storedOtp) !== otp) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid OTP. Please try again.')
  }

  user.isVerified = true;
  await user.save();

  // OTP is valid, delete OTP from Redis
  await redisClient.del(`otp:${user.email}`);
  return null;
}




export const userServices = {
    registerUserService,
    updateUserService,
    sendVerificationOtpService,
    verifyUserProfileService
}