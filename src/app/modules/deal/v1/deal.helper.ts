import { PipelineStage } from "mongoose";
import { SearchDealsByLocationQuery } from "../deal.validate";
import { Views_Impressions } from "../../views_impression/vi.model";
import { dealLogger } from "../../../utils/logger/logger.child";
import { Types } from "mongoose";


export const visibleDealFilter = {
  isBanned: { $ne: true },
  deal_status: { $ne: 'BANNED' },
};

const normalizeLocationText = (value: string) => value.trim().toLowerCase();

export const buildLocationLabel = (query: SearchDealsByLocationQuery) => {
  if (query.locationMode === 'CURRENT_LOCATION') {
    return 'Current location';
  }

  return [query.city, query.state, query.country].filter(Boolean).join(', ');
};

export const getDealLookupStage = (now: Date): PipelineStage.Lookup => ({
  $lookup: {
    from: 'deals',
    let: { locationId: '$_id' },
    pipeline: [
      {
        $match: {
          $expr: {
            $in: [
              '$$locationId',
              { $ifNull: ['$available_in_location', []] },
            ],
          },
          isPromoted: true,
          promotedUntil: { $gte: now },
          ...visibleDealFilter,
        },
      },
    ],
    as: 'deal',
  },
});

export const getDealListFacet = (
  page: number,
  limit: number,
  sort: Record<string, 1 | -1>
): PipelineStage.Facet => {
  const skip = (page - 1) * limit;

  return {
    $facet: {
      deals: [
        { $sort: sort },
        { $skip: skip },
        { $limit: limit },
        {
          $lookup: {
            from: 'shops',
            localField: 'shop',
            foreignField: '_id',
            as: 'shop',
            pipeline: [
              {
                $project: {
                  business_name: 1,
                  business_logo: 1,
                },
              },
            ],
          },
        },
        { $unwind: '$shop' },
        {
          $project: {
            title: 1,
            regular_price: 1,
            discount: 1,
            discount_type: 1,
            minimum_purchase: 1,
            coupon_required: 1,
            images: { $slice: ['$images', 1] },
            distance: 1,
            nearest_location: 1,
            matched_location: 1,
            shop: 1,
            isPromoted: 1,
            promotedUntil: 1,
            nationwide: 1,
          },
        },
      ],
      total: [{ $count: 'count' }],
    },
  };
};

export const recordDealImpressions = (deals: { _id: Types.ObjectId }[]) => {
  const uniqueIds = [
    ...new Set(deals.map((deal) => deal._id.toString())),
  ];

  if (!uniqueIds.length) return;

  setImmediate(() => {
    const analyticsDocs = uniqueIds.map((dealId) => ({
      deal: dealId,
      type: 'impression',
    }));

    Views_Impressions.insertMany(analyticsDocs).catch((error) => {
      dealLogger.error({ error }, 'Failed to record deal impressions');
    });
  });
};

export const buildLocationEqualityCondition = (
  key: 'city' | 'state' | 'country' | 'zip_code',
  value: string
) => {
  const normalizedValue = normalizeLocationText(value);

  return {
    $or: [
      { [`normalized.${key}`]: normalizedValue },
      {
        $expr: {
          $eq: [
            {
              $toLower: {
                $ifNull: [`$address.${key}`, ''],
              },
            },
            normalizedValue,
          ],
        },
      },
    ],
  };
};

export const getNationwideDealsUnionStage = (
  now: Date,
  extraMatch: Record<string, unknown> = {}
): PipelineStage => ({
  $unionWith: {
    coll: 'deals',
    pipeline: [
      {
        $match: {
          nationwide: true,
          isPromoted: true,
          promotedUntil: { $gte: now },
          ...visibleDealFilter,
          ...extraMatch,
        },
      },
      {
        $addFields: {
          distance: null,
          nearest_location: null,
          matched_location: null,
          locationSort: 1,
        },
      },
    ],
  },
});

export const buildLocationDealsCacheKey = (
  query: SearchDealsByLocationQuery
) => {
  if (query.locationMode === 'CURRENT_LOCATION') {
    return [
      'location_deals',
      query.locationMode,
      query.lat.toFixed(2),
      query.lng.toFixed(2),
      'radius',
      query.radiusKm,
      'page',
      query.page,
      'limit',
      query.limit,
    ].join(':');
  }

  return [
    'location_deals',
    query.locationMode,
    'city',
    query.city ? normalizeLocationText(query.city) : '',
    'state',
    query.state ? normalizeLocationText(query.state) : '',
    'country',
    normalizeLocationText(query.country),
    'zip',
    query.zip_code ? normalizeLocationText(query.zip_code) : '',
    'page',
    query.page,
    'limit',
    query.limit,
  ].join(':');
};
