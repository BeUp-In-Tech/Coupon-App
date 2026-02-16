import AppError from "../../errorHelpers/AppError";
import { IAuthProvider, IVendor } from "./user.interface";
import User from "./user.model";


// CREATE VENDOR SERVICE
const registerUser = async (payload: IVendor) => {
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



export const userServices = {
    registerUser
}