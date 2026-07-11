import { StatusCodes } from 'http-status-codes';
import AppError from '../../errorHelpers/AppError';
import { Shop } from '../shop/shop.model';
import ExcelJS from 'exceljs';
import {
  ICompletedBulkLocationImport,
  ILocation,
  IStagedBulkLocationBatch,
} from './location.interface';
import { Location, Location as OutletModel } from './location.model';
import { Types } from 'mongoose';
import { redisClient } from '../../config/redis.config';
import { randomUUID } from 'crypto';
import { invalidateAllMachineryCache } from '../../utils/deleteCachedData';
import {
  BULK_LOCATION_HEADERS,
  createLocationFingerprint,
  parseBulkLocationFile,
} from './locationBulkUpload.utility';
import { locationLogger, LoggerModule } from '../../utils/logger/logger.child';
import { DealModel } from '../deal/v1/deal.model';

interface ILocationPayload extends ILocation {
  coordinates?: [number, number];
}

const BULK_LOCATION_BATCH_TTL_SECONDS = 30 * 60;
const bulkBatchKey = (batchId: string) => `bulk-location:${batchId}`;
const bulkLockKey = (batchId: string) => `bulk-location-lock:${batchId}`;
const bulkCompletedKey = (batchId: string) => `bulk-location-done:${batchId}`;

const normalizeLocationText = (value?: string) => value?.trim().toLowerCase();

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
    location_name: payload.location_name
      ? payload.location_name.trim()
      : undefined,
    address: {
      street: payload?.address?.street.trim(),
      zip_code: payload?.address?.zip_code.trim(),
      city: payload?.address?.city.trim(),
      state: payload?.address?.state.trim(),
      country: payload?.address?.country.trim(),
    },
    normalized: {
      city: normalizeLocationText(payload?.address?.city),
      state: normalizeLocationText(payload?.address?.state),
      country: normalizeLocationText(payload?.address?.country),
      zip_code: normalizeLocationText(payload?.address?.zip_code),
    },
    isActive: payload.isActive,
    location: {
      type: 'Point',
      coordinates: [...(payload.coordinates ?? [0, 0])],
    },
  };

  const createdLocation = await Location.create(location);

  await redisClient.del(`shop:${shop._id.toString()}`);
  await redisClient.del(`shop:${userId}`);
  await invalidateAllMachineryCache('location_deals:*');

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
        updateData[`normalized.${key}`] = normalizeLocationText(value);
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
  await invalidateAllMachineryCache('location_deals:*');

  return updateOutlet;
};

// DELETE LOCATION
const deleteLocation = async (userId: string, locationId: string, shopId: string) => {
  const locationObjectId = new Types.ObjectId(locationId);
  const shop = await Shop.findOne({ _id: shopId, vendor: userId });

  locationLogger.debug(shop);
  if (!shop) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Shop not found', LoggerModule.LOCATION);
  }

  const filter = { _id: locationObjectId, shop: shop._id };
  const location = await Location.findOne(filter);
  if (!location) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Location not found', LoggerModule.LOCATION);
  }

  const dealsUsingLocation = await DealModel.find({
    available_in_location: locationObjectId,
    nationwide: { $ne: true },
  })
    .select('_id available_in_location')
    .lean();

  const blockingDeals = dealsUsingLocation.filter((deal) => {
    const remainingLocations = (deal.available_in_location ?? []).filter(
      (id) => id.toString() !== locationId
    );

    return remainingLocations.length === 0;
  });

  if (blockingDeals.length > 0) {
    throw new AppError(
      StatusCodes.CONFLICT,
      'Cannot delete this location because it is the only available location for one or more deals. Add another location to the deal first.',
      LoggerModule.LOCATION
    );
  }

  const deleteLocationResult = await Location.deleteOne(filter);
  if (deleteLocationResult.deletedCount > 0) {
    const removeFromDeal = await DealModel.updateMany(
      {
        available_in_location: locationObjectId,
      },
      {
        $pull: {
          available_in_location: locationObjectId,
        },
      }
    );

    await redisClient.del(`shop:${shop._id.toString()}`);
    await redisClient.del(`shop:${userId}`);
    await redisClient.del('deals_by_category_stats');
    await invalidateAllMachineryCache('machinery:*');
    await invalidateAllMachineryCache('location_deals:*');
    await invalidateAllMachineryCache('recent_deals:*');
    await invalidateAllMachineryCache('deals_stats:*');
    await invalidateAllMachineryCache('saved:*');
    await invalidateAllMachineryCache(`my_deals-userId:${userId}:*`);

    return {
      deleteLocation: deleteLocationResult,
      removeFromDeal,
    };
  }

  return deleteLocationResult;
};

// VALIDATE THE ENTIRE FILE STAGE VALID ROWS WITHOUT WRITING LOCATIONS.
const previewBulkLocationsService = async (
  userId: string,
  file?: Express.Multer.File
) => {
  if (!file) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'Location file is required');
  }

  const shop = await Shop.findOne({ vendor: userId }).select('_id').lean();
  if (!shop) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Shop not found');
  }

  const existingLocations = await Location.find({ shop: shop._id })
    .select('location_name address location isActive shop')
    .lean();
  const existingFingerprints = new Set(
    existingLocations.map((location) => createLocationFingerprint(location))
  );

  const parsed = await parseBulkLocationFile({ file, existingFingerprints });
  const invalidRows = new Set(parsed.errors.map((error) => error.rowNumber))
    .size;
  const expiresAt = new Date(
    Date.now() + BULK_LOCATION_BATCH_TTL_SECONDS * 1000
  ).toISOString();

  let batchId: string | undefined;
  if (parsed.rows.length > 0) {
    batchId = randomUUID();
    const batch: IStagedBulkLocationBatch = {
      userId,
      shopId: shop._id.toString(),
      totalRows: parsed.totalRows,
      invalidRows,
      rows: parsed.rows,
      expiresAt,
    };

    await redisClient.set(bulkBatchKey(batchId), JSON.stringify(batch), {
      EX: BULK_LOCATION_BATCH_TTL_SECONDS,
    });
  }

  return {
    batchId,
    ...(batchId ? { expiresAt } : {}),
    summary: {
      totalRows: parsed.totalRows,
      validRows: parsed.rows.length,
      invalidRows,
    },
    errors: parsed.errors,
  };
};

// CONFIRM ONE STAGE BATCH; A REDIS LOCK PREVENT CONCURRENT DOUBLE IMPORTS.
const confirmBulkLocationsService = async (userId: string, batchId: string) => {
  const completedValue = await redisClient.get(bulkCompletedKey(batchId));
  if (completedValue) {
    const completed = JSON.parse(
      completedValue
    ) as ICompletedBulkLocationImport;
    if (completed.userId !== userId) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Location batch not found');
    }
    return completed.result;
  }

  const batchValue = await redisClient.get(bulkBatchKey(batchId));
  if (!batchValue) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      'Location batch was not found or has expired'
    );
  }

  const batch = JSON.parse(batchValue) as IStagedBulkLocationBatch;
  if (batch.userId !== userId) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Location batch not found');
  }

  const locked = await redisClient.set(bulkLockKey(batchId), '1', {
    NX: true,
    EX: 5 * 60,
  });
  if (!locked) {
    throw new AppError(
      StatusCodes.CONFLICT,
      'This location batch is already being imported'
    );
  }

  try {
    const shop = await Shop.findOne({
      _id: batch.shopId,
      vendor: userId,
    })
      .select('_id')
      .lean();
    if (!shop) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Shop not found');
    }

    // Recheck duplicates because shop locations can change during preview review.
    const existingLocations = await Location.find({ shop: shop._id })
      .select('location_name address location isActive shop')
      .lean();
    const existingFingerprints = new Set(
      existingLocations.map((location) => createLocationFingerprint(location))
    );
    const hasNewDuplicate = batch.rows.some((row) =>
      existingFingerprints.has(createLocationFingerprint(row))
    );
    if (hasNewDuplicate) {
      throw new AppError(
        StatusCodes.CONFLICT,
        'Shop locations changed after preview. Please preview the file again'
      );
    }

    const locations = batch.rows.map((row) => ({
      shop: shop._id,
      location_name: row.location_name,
      address: {
        street: row.street,
        zip_code: row.zip_code,
        city: row.city,
        state: row.state,
        country: row.country,
      },
      normalized: {
        city: normalizeLocationText(row.city),
        state: normalizeLocationText(row.state),
        country: normalizeLocationText(row.country),
        zip_code: normalizeLocationText(row.zip_code),
      },
      location: {
        type: 'Point' as const,
        coordinates: [row.longitude, row.latitude] as [number, number],
      },
      isActive: row.isActive,
    }));

    await Location.insertMany(locations, { ordered: true });

    const result = {
      totalRows: batch.totalRows,
      importedCount: locations.length,
      skippedInvalidCount: batch.invalidRows,
    };

    await Promise.all([
      redisClient.del(`shop:${shop._id.toString()}`),
      redisClient.del(`shop:${userId}`),
      invalidateAllMachineryCache('all_vendors_dashboard:*'),
      invalidateAllMachineryCache('location_deals:*'),
      redisClient.set(
        bulkCompletedKey(batchId),
        JSON.stringify({ userId, result }),
        { EX: BULK_LOCATION_BATCH_TTL_SECONDS }
      ),
    ]);
    await redisClient.del(bulkBatchKey(batchId));

    return result;
  } finally {
    await redisClient.del(bulkLockKey(batchId));
  }
};

// GENERATE BULK UPLOAD EXAMPLE TEMPLATE
const generateBulkLocationTemplate = async () => {
  const workbook = new ExcelJS.Workbook();
  const locations = workbook.addWorksheet('Locations', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  locations.addRow(BULK_LOCATION_HEADERS.map(({ label }) => label));
  locations.addRow([
    'Main Branch',
    '123 Example Road',
    '1205',
    'Dhaka',
    'Dhaka Division',
    'Bangladesh',
    90.4125,
    23.8103,
    true,
  ]);
  locations.columns = [
    { width: 24 },
    { width: 28 },
    { width: 14 },
    { width: 20 },
    { width: 22 },
    { width: 20 },
    { width: 14 },
    { width: 14 },
    { width: 12 },
  ];
  locations.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  locations.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1F4E78' },
  };
  locations.getRow(2).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFFF2CC' },
  };
  locations.getColumn(3).numFmt = '@';

  const instructions = workbook.addWorksheet('Instructions');
  instructions.columns = [{ width: 24 }, { width: 90 }];
  instructions.addRows([
    ['Rule', 'Description'],
    [
      'Example row',
      'Replace or delete the yellow example row before uploading your locations.',
    ],
    [
      'Headers',
      'Keep the template header names unchanged; the backend maps them to location fields.',
    ],
    [
      'Required columns',
      'Every column is required except isActive, which defaults to true when blank.',
    ],
    [
      'Coordinates',
      'Longitude must be -180 to 180. Latitude must be -90 to 90.',
    ],
    ['Is active', 'Use true, false, 1, 0, or leave blank for true.'],
    ['Zip code', 'Keep Zip code formatted as text to preserve leading zeros.'],
    ['Duplicates', 'Identical name, address, and coordinates are rejected.'],
    ['Limits', 'Maximum 5,000 non-empty rows and 10 MB per file.'],
  ]);
  instructions.getRow(1).font = { bold: true };

  return Buffer.from(await workbook.xlsx.writeBuffer());
};

// GET LOCATION SUGGESTION FROM SEARCHBAR
const getLocationSuggestions = async (query: Record<string, string>) => {
  const search = String(query.search || '').trim().toLowerCase();

  if (!search) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'Empty search');
  }

  const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = { $regex: escapedSearch, $options: 'i' };

  const suggestions = await Location.aggregate([
    // ── Stage 1: Filter active locations matching the search term ──────────
    {
      $match: {
        isActive: true,
        $or: [
          { 'address.city': regex },
          // { 'address.state': regex },
          { 'address.zip_code': regex },
          // { 'address.country': regex },
          { location_name: regex },
        ],
      },
    },

    // ── Stage 2: Add computed fields for grouping and ranking ───────────────
    // We derive normalized keys directly from address fields using $toLower
    // so the grouping works even on older docs that have no normalized field.
    {
      $addFields: {
        // Normalized keys used as group keys — guarantees case-insensitive dedup
        _cityKey:    { $toLower: { $ifNull: ['$address.city',    ''] } },
        _stateKey:   { $toLower: { $ifNull: ['$address.state',   ''] } },
        _countryKey: { $toLower: { $ifNull: ['$address.country', ''] } },

        // Rank so that exact city matches sort before partial matches
        searchRank: {
          $switch: {
            branches: [
              // Exact city match
              {
                case: { $eq: [{ $toLower: { $ifNull: ['$address.city', ''] } }, search] },
                then: 1,
              },
              // City starts with search term
              {
                case: {
                  $regexMatch: {
                    input: { $ifNull: ['$address.city', ''] },
                    regex: `^${escapedSearch}`,
                    options: 'i',
                  },
                },
                then: 2,
              },
              // City contains search term
              {
                case: {
                  $regexMatch: {
                    input: { $ifNull: ['$address.city', ''] },
                    regex: escapedSearch,
                    options: 'i',
                  },
                },
                then: 3,
              },
              // State match
              {
                case: { $eq: [{ $toLower: { $ifNull: ['$address.state', ''] } }, search] },
                then: 4,
              },
              // Zip code match
              {
                case: { $eq: [{ $toLower: { $ifNull: ['$address.zip_code', ''] } }, search] },
                then: 5,
              },
              // Location name match
              {
                case: {
                  $regexMatch: {
                    input: { $ifNull: ['$location_name', ''] },
                    regex: escapedSearch,
                    options: 'i',
                  },
                },
                then: 6,
              },
            ],
            default: 99,
          },
        },
      },
    },

    // ── Stage 3: Sort before group so $first picks the best-ranked doc ─────
    { $sort: { searchRank: 1, 'address.city': 1, 'address.state': 1 } },

    // ── Stage 4: Deduplicate by city only ─────────────────────────────────
    // Group on normalized city key alone so the same city name never appears
    // twice in results regardless of how vendors entered state or country.
    {
      $group: {
        _id: '$_cityKey',
        city:     { $first: '$address.city' },
        state:    { $first: '$address.state' },
        country:  { $first: '$address.country' },
        location: { $first: '$location' },
        searchRank: { $first: '$searchRank' },
      },
    },

    // ── Stage 5: Final sort after dedup ────────────────────────────────────
    { $sort: { searchRank: 1, '_id': 1 } },

    // ── Stage 6: Shape the response ────────────────────────────────────────
    {
      $project: {
        _id: 0,
        city: 1,
        state: 1,
        country: 1,
        location: 1,
        // Human-readable label: "Dhaka, Dhaka Division" or just "Dhaka"
        label: {
          $cond: [
            {
              $and: [
                { $gt: [{ $strLenCP: { $ifNull: ['$city',  ''] } }, 0] },
                { $gt: [{ $strLenCP: { $ifNull: ['$state', ''] } }, 0] },
              ],
            },
            { $concat: [{ $ifNull: ['$city', ''] }, ', ', { $ifNull: ['$state', ''] }] },
            {
              $cond: [
                { $gt: [{ $strLenCP: { $ifNull: ['$city', ''] } }, 0] },
                { $ifNull: ['$city', ''] },
                { $ifNull: ['$state', ''] },
              ],
            },
          ],
        },
      },
    },

    // Drop results with a label shorter than 3 characters (noise)
    { $match: { $expr: { $gte: [{ $strLenCP: '$label' }, 3] } } },

    { $limit: 30 },
  ]);

  return suggestions;
};

export const locationServices = {
  createLocationService,
  updateLocationService,
  previewBulkLocationsService,
  confirmBulkLocationsService,
  generateBulkLocationTemplate,
  getLocationSuggestions,
  deleteLocation
};
