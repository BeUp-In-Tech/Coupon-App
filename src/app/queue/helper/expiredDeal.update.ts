/* eslint-disable @typescript-eslint/no-explicit-any */
import { Types } from 'mongoose';
import { DealModel } from '../../modules/deal/v1/deal.model';
import { Promotion } from '../../modules/promotion/promotion.model';
import { PromotionStatus } from '../../modules/promotion/promotion.interface';
import { connectRedis, redisClient } from '../../config/redis.config';
import { invalidateAllMachineryCache } from '../../utils/deleteCachedData';
import { workerLogger } from '../../utils/logger/logger.child';

const queuedLogger = workerLogger.child({
  queue: 'dealHandleQueue',
  helper: 'expiredDealUpdate',
});

const clearDealExpireCache = async (dealUpdate: any) => {
  try {
    await connectRedis();

    await redisClient.del(`shop:${dealUpdate.user.toString()}`);
    await redisClient.del(`shop:${dealUpdate.shop.toString()}`);
    await invalidateAllMachineryCache('machinery:*');
    await invalidateAllMachineryCache(
      `my_deals-userId:${dealUpdate.user.toString()}:*`
    ); // get my deals cache invalidate (deal.service.ts)
  } catch (error: any) {
    queuedLogger.error(
      { error, dealId: dealUpdate?._id?.toString() },
      'Deal expire cache clear problem'
    );
  }
};

export const dealExpireHandle = async (dealId: string) => {
  try {
    // DEAL UPDATE
    const dealUpdate = await DealModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(dealId),
        isPromoted: true,
      },
      {
        $set: { isPromoted: false },
      },
      {
        new: true,
      }
    );

    if (!dealUpdate) {
      queuedLogger.info({ dealId }, 'Deal not found or not promoted');
      return;
    }

    // PROMOTION UPDATE
    const promotionUpdate = await Promotion.updateMany(
      {
        deal: new Types.ObjectId(dealId),
        status: { $ne: PromotionStatus.EXPIRED }, // only update if not already expired
      },
      {
        $set: { status: PromotionStatus.EXPIRED },
      }
    );

    queuedLogger.info(
      {
        dealId,
        title: dealUpdate?.title,
        expiredPromotions: promotionUpdate.modifiedCount || 0,
      },
      'Deal updated to isPromoted=false'
    );

    // CLEAR CACHE
    await clearDealExpireCache(dealUpdate);
  } catch (error: any) {
    queuedLogger.error({ error, dealId }, 'Deal expire handle problem');
  }
};
