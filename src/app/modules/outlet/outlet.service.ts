import { StatusCodes } from 'http-status-codes';
import AppError from '../../errorHelpers/AppError';
import { Shop } from '../shop/shop.model';
import { IOutlet } from './outlet.interface';
import { OutletModel } from './outlet.model';
import { redisClient } from '../../config/redis.config';

interface IOutletPayload extends IOutlet {
  coordinates?: [number, number];
}

interface IOutletCreatePayload {
  outlet: (Pick<IOutlet, 'outlet_name' | 'address' | 'zip_code'> & {
    coordinates: [number, number];
  })[];
}

const createOutletService = async (
  userId: string,
  payload: IOutletCreatePayload
) => {
  const shop = await Shop.findOne({ vendor: userId }).lean();

  if (!shop) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Shop not found');
  }

  const outlets = payload.outlet.map((outlet) => ({
    shop: shop._id,
    outlet_name: outlet.outlet_name,
    address: outlet.address.trim(),
    zip_code: outlet.zip_code.trim(),
    location: {
      type: 'Point',
      coordinates: [...outlet.coordinates],
    },
  }));

  const createdOutlets = await OutletModel.insertMany(outlets, {
    ordered: true,
  });

  await redisClient.del(`shop:${shop._id.toString()}`);
  await redisClient.del(`shop:${userId}`);

  return {
    outlets_created: createdOutlets.length,
    outlets: createdOutlets,
  };
};

const updateOutletService = async (
  outletId: string,
  userId: string,
  payload: Partial<IOutletPayload>
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

  if (payload.coordinates) {
    payload.location = {
      type: 'Point',
      coordinates: payload.coordinates,
    };
  }

  const updateOutlet = await OutletModel.findOneAndUpdate(
    { _id: outletId, shop: shop._id },
    payload,
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
  createOutletService,
  updateOutletService,
};
