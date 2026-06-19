import { StatusCodes } from 'http-status-codes';
import AppError from '../../errorHelpers/AppError';
import { Shop } from '../shop/shop.model';
import { ILocation } from './location.interface';
import { Location, Location as OutletModel} from './location.model';
import { redisClient } from '../../config/redis.config';


interface ILocationPayload extends ILocation {
  coordinates?: [number, number];
}



// CREATE LOCATION
const createLocationService = async (
  userId: string,
  payload: Partial<ILocationPayload>
) => {
  const shop = await Shop.findOne({ vendor: userId }).lean();

  if (!shop) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Shop not found');
  }

  const location = {
    shop: shop._id.toString(),
    location_name: payload.location_name ? payload.location_name.trim() : undefined,
    address: {
      street: payload?.address?.street.trim(),
      zip_code: payload?.address?.zip_code.trim(),
      city: payload?.address?.city.trim(),
      state: payload?.address?.state.trim(),
      country: payload?.address?.country.trim(),
    },
    isActive: payload.isActive,
    location: {
      type: 'Point',
      coordinates: [...(payload.coordinates ?? [0, 0])]
    }
  }


  const createdLocation = await Location.create(location);

  await redisClient.del(`shop:${shop._id.toString()}`);
  await redisClient.del(`shop:${userId}`);

  return createdLocation;
};

// UPDATE LOCATION
const updateLocationService = async (
  locationId: string,
  userId: string,
  payload: Partial<ILocationPayload>
) => {
  const shop = await Shop.findOne({ vendor: userId }).lean();

  if (!shop) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Location or shop not found');
  }

  if (userId !== shop.vendor.toString()) {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      "Access denied, you can't update"
    );
  }

  // Build update object using dot notation to preserve nested fields
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: Record<string, any> = {};

  if (payload.location_name !== undefined) {
    updateData.location_name = payload.location_name;
  }

  if (payload.isActive !== undefined) {
    updateData.isActive = payload.isActive;
  }

  // Handle nested address fields with dot notation
  if (payload.address) {
    Object.entries(payload.address).forEach(([key, value]) => {
      if (value !== undefined) {
        updateData[`address.${key}`] = value;
      }
    });
  }

  if (payload.coordinates) {
    updateData.location = {
      type: 'Point',
      coordinates: payload.coordinates,
    };
  }

  const updateOutlet = await OutletModel.findOneAndUpdate(
    { _id: locationId, shop: shop._id },
    { $set: updateData }, // Using $set operator for clarity
    { runValidators: true, new: true }
  );

  if (!updateOutlet) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'Location not found');
  }

  // DELETE SHOP CACHED DATA
  await redisClient.del(`shop:${updateOutlet.shop.toString()}`);
  await redisClient.del(`shop:${userId}`);

  return updateOutlet;
};

export const outletServices = {
  createLocationService,
  updateLocationService,
};
