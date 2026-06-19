import { promises as fs } from 'fs';
import { StatusCodes } from 'http-status-codes';
import { JwtPayload } from 'jsonwebtoken';
import AppError from '../../errorHelpers/AppError';
import { IVendorExportJobResult } from '../../queue/job/vendorExport.job';
import { vendorExportQueue } from '../../queue/index.queue';
import { redisClient } from "../../config/redis.config";
import { invalidateAllMachineryCache } from "../../utils/deleteCachedData";
import { isVendorExportPathSafe } from '../../utils/export/vendorExportWorkbook.utility';
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

// Hide jobs owned by other admins by treating them as not found.
export const getOwnedVendorExportJob = async (
  adminUser: JwtPayload,
  jobId: string
) => {
  const job = await vendorExportQueue.getJob(jobId);

  if (!job || job.data.requestedBy !== adminUser.userId) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Vendor job not found');
  }

  return job;
};

// Validate expiry, trusted path, and physical file existence before exposing a download.
export const assertVendorExportIsAvailable = async (
  result: IVendorExportJobResult | undefined
) => {
  if (!result || new Date(result.expiresAt).getTime() <= Date.now()) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Vendor export has expired');
  }

  if (!isVendorExportPathSafe(result.filePath)) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Vendor export file not found');
  }

  try {
    await fs.access(result.filePath);
  } catch {
    throw new AppError(StatusCodes.NOT_FOUND, 'Vendor export file not found');
  }

  return result;
};
