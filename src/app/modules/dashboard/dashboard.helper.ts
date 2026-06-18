import { redisClient } from "../../config/redis.config";
import { invalidateAllMachineryCache } from "../../utils/deleteCachedData";
import { IDeal } from "../deal/deal.interface";

// CACHE INVALIDATION HELPER
export const invalidateDealVisibilityCache = async (deal: IDeal) => {
  const shopId = deal.shop.toString();
  const vendorId = deal.user.toString();

  await Promise.all([
    redisClient.del(`shop:${shopId}`),
    redisClient.del(`shop:${vendorId}`),
    redisClient.del('dashboard_analytics_total'),
    invalidateAllMachineryCache('machinery:*'),
    invalidateAllMachineryCache('recent_deals:*'),
    invalidateAllMachineryCache('deals_stats:*'),
    invalidateAllMachineryCache(`my_deals-userId:${vendorId}:*`),
    invalidateAllMachineryCache('saved:*'),
  ]);
};
