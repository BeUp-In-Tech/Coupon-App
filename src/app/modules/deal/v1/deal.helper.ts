import { PipelineStage } from "mongoose";
import { SearchDealsByLocationQuery } from "../deal.validate";
import { Views_Impressions } from "../../views_impression/vi.model";
import { dealLogger } from "../../../utils/logger/logger.child";
import { Types } from "mongoose";
import { Location } from "../../location/location.model";


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

/**
 * Builds a Redis cache key for location-based deal queries.
 *
 * For SELECTED_LOCATION mode, an optional `fallbackUsed` flag is appended so
 * that exact-match results and radius-fallback results are stored under
 * separate keys and never collide in the cache. (REQ 2.15)
 */
export const buildLocationDealsCacheKey = (
  query: SearchDealsByLocationQuery,
  fallbackUsed?: boolean
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
    'fallback',
    fallbackUsed ?? 'false',
  ].join(':');
};

// ---------------------------------------------------------------------------
// Task 1.1 — LocationResolutionResult discriminated union
// ---------------------------------------------------------------------------

/**
 * The three possible outcomes of resolving location documents for a
 * SELECTED_LOCATION query:
 *
 * 1. Exact match found — use those location IDs directly, no fallback.
 * 2. No exact match but a regional centroid exists — use 25-mile radius
 *    locations around that centroid (radius fallback).
 * 3. No locations exist at all for the country/state — cannot produce
 *    local deals; caller should return nationwide-only results.
 */
export type LocationResolutionResult =
  | { locationIds: Types.ObjectId[]; fallbackUsed: false; fallbackReason: null }
  | { locationIds: Types.ObjectId[]; fallbackUsed: true; fallbackReason: 'NO_DEALS_IN_EXACT_LOCATION' }
  | { locationIds: []; fallbackUsed: true; fallbackReason: 'NO_LOCATIONS_IN_REGION' };

// ---------------------------------------------------------------------------
// Task 1.2 — resolveSelectedLocationDocs
// ---------------------------------------------------------------------------

/**
 * Earth's mean radius in metres — used to convert the 25-mile search radius
 * into the radians required by MongoDB's $centerSphere operator.
 */
const EARTH_RADIUS_METERS = 6_378_137;

/** 50 miles expressed in metres (the fallback search radius). */
const FALLBACK_RADIUS_METERS = 80_467;

/**
 * Resolves Location documents for a SELECTED_LOCATION query following the
 * two-step strategy described in REQ 2.3–2.5:
 *
 *  Step 1 — Exact match: query active Location docs whose city / state /
 *            country / zip_code fields match the incoming query params.
 *  Step 2 — Radius fallback (only when Step 1 returns nothing): find the
 *            nearest location centroid within the same country/state and
 *            return all Location docs within 25 miles of that centroid.
 *
 * Returns a `LocationResolutionResult` that tells the caller which IDs to
 * use and whether a fallback was applied, so the service layer can set the
 * correct `meta.fallbackUsed` / `meta.fallbackReason` values.
 */
export async function resolveSelectedLocationDocs(
  query: Extract<SearchDealsByLocationQuery, { locationMode: 'SELECTED_LOCATION' }>
): Promise<LocationResolutionResult> {
  const { city, state, country, zip_code } = query;

  // ── Step 1: Build equality conditions for every provided location field ──
  const conditions: ReturnType<typeof buildLocationEqualityCondition>[] = [];

  if (city)     conditions.push(buildLocationEqualityCondition('city',     city));
  if (state)    conditions.push(buildLocationEqualityCondition('state',    state));
  if (country)  conditions.push(buildLocationEqualityCondition('country',  country));
  if (zip_code) conditions.push(buildLocationEqualityCondition('zip_code', zip_code));

  // Only retrieve _id and location — we don't need the full document
  const exactMatches = await Location.find(
    { isActive: true, $and: conditions },
    { _id: 1, location: 1 }
  ).lean();

  if (exactMatches.length > 0) {
    // Exact match found — no fallback needed (REQ 2.4)
    return {
      locationIds: exactMatches.map((doc) => doc._id as Types.ObjectId),
      fallbackUsed: false,
      fallbackReason: null,
    };
  }

  // ── Step 2: No exact match — attempt radius fallback (REQ 2.3) ──
  //
  // To find the correct centroid we search progressively from most-specific to
  // least-specific.  This ensures the 25-mile radius is anchored as close to
  // the REQUESTED city as possible, not on a random city in the same state.
  //
  //   Pass 1 — city + state + country  (best anchor: same city name in DB)
  //   Pass 2 — state + country         (city not in DB but state is known)
  //   Pass 3 — country only            (last resort)
  //
  // If all three passes return nothing, the region has no Location data at all.
  const normalizedCity    = city    ? city.trim().toLowerCase()    : null;
  const normalizedState   = state   ? state.trim().toLowerCase()   : null;
  const normalizedCountry = country.trim().toLowerCase();

  let centroidDoc: { location: { coordinates: [number, number] } } | null = null;

  // Pass 1: try to find any doc whose city name matches (best geographic anchor)
  if (normalizedCity) {
    centroidDoc = await Location.findOne(
      {
        isActive: true,
        'normalized.country': normalizedCountry,
        ...(normalizedState ? { 'normalized.state': normalizedState } : {}),
        'normalized.city': normalizedCity,
      },
      { location: 1 }
    ).lean();
  }

  // Pass 2: relax to state-level if the city is not in the DB
  if (!centroidDoc && normalizedState) {
    centroidDoc = await Location.findOne(
      {
        isActive: true,
        'normalized.country': normalizedCountry,
        'normalized.state': normalizedState,
      },
      { location: 1 }
    ).lean();
  }

  // Pass 3: relax to country-level as the last resort
  if (!centroidDoc) {
    centroidDoc = await Location.findOne(
      { isActive: true, 'normalized.country': normalizedCountry },
      { location: 1 }
    ).lean();
  }

  if (!centroidDoc) {
    // No locations found in this region at all (REQ 2.5)
    return { locationIds: [], fallbackUsed: true, fallbackReason: 'NO_LOCATIONS_IN_REGION' };
  }

  const [lng, lat] = centroidDoc.location.coordinates;
  const radiusRadians = FALLBACK_RADIUS_METERS / EARTH_RADIUS_METERS;

  // $geoWithin + $centerSphere does NOT require a special index stage and works
  // directly in a .find() call — appropriate here because we are querying the
  // Location collection, not running a deal aggregation pipeline.
  const nearbyLocations = await Location.find(
    {
      isActive: true,
      location: {
        $geoWithin: {
          $centerSphere: [[lng, lat], radiusRadians],
        },
      },
    },
    { _id: 1 }
  ).lean();

  return {
    locationIds: nearbyLocations.map((l) => l._id as Types.ObjectId),
    fallbackUsed: true,
    fallbackReason: 'NO_DEALS_IN_EXACT_LOCATION',
  };
}

// ---------------------------------------------------------------------------
// Task 1.3 — buildRadiusFallbackStage
// ---------------------------------------------------------------------------

/**
 * Factory that produces a `$geoNear` pipeline stage centred on `centroid`
 * within `radiusMeters`.
 *
 * This is intended for use in MongoDB aggregation pipelines against the
 * Location collection when a pipeline-based approach is preferred.  In the
 * current implementation `resolveSelectedLocationDocs` uses a direct
 * `.find()` + `$geoWithin` query instead, but this factory is exported for
 * completeness and future pipeline composition. (Design doc — buildRadiusFallbackStage)
 *
 * @param centroid    GeoJSON Point representing the centre of the search area.
 * @param radiusMeters  Search radius expressed in metres (e.g. 40 233 for 25 mi).
 */
export function buildRadiusFallbackStage(
  centroid: { type: 'Point'; coordinates: [number, number] },
  radiusMeters: number
): PipelineStage.GeoNear {
  const [lng, lat] = centroid.coordinates;

  return {
    $geoNear: {
      near: { type: 'Point', coordinates: [lng, lat] },
      distanceField: 'distance',
      maxDistance: radiusMeters,
      spherical: true,
      query: { isActive: true },
    },
  };
}
