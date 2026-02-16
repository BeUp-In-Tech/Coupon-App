import AppError from "../../errorHelpers/AppError";
import { IAuthProvider, IVendor } from "./vendor.interface";
import Vendor from "./vendor.model";


// CREATE VENDOR SERVICE
const registerVendor = async (payload: IVendor) => {
     const { email, ...rest } = payload;

  const isVendor = await Vendor.findOne({ email });
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
  const creatUser = await Vendor.create(userPayload); 
  return creatUser;
}



export const vendorServices = {
    registerVendor
}