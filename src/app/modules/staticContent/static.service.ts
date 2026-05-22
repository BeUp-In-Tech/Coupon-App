import { redisClient } from "../../config/redis.config";
import { invalidateAllMachineryCache } from "../../utils/deleteCachedData";
import { STATIC_PAGES } from "./static.interface";
import { StaticPageModel } from "./static.model";



// 1. CREATE STATIC PAGE
const createStaticPage = async (payload: {
  slug: string;
  title: string;
  content: string;
}) => {
  if (!STATIC_PAGES.includes(payload.slug)) {
    throw new Error('Invalid page slug' + payload.slug, );
  }

  const result = await StaticPageModel.findOneAndUpdate(
    { slug: payload.slug },
    payload,
    {
      new: true,
      upsert: true, // create if not exists
    }
  );

  // CACHE INVALIDATE
  await invalidateAllMachineryCache('staticPage:*');

  return result;
};

// 2. GET STATIC PAGE
const getStaticPage = async (slug: string) => {
  if (!STATIC_PAGES.includes(slug)) {
    throw new Error('Invalid page slug');
  }

  // CHECK IF DATA EXISTS IN CACHE
  const cacheKey = `staticPage:${slug}`;
  const cachedData = await redisClient.get(cacheKey);


  // CACHE DATA
  if (cachedData) {
    return JSON.parse(cachedData);
  }

  // DATABASE QUERY
  const result = await StaticPageModel.findOne({ slug });

  // Only cache if the page actually exists — avoid caching null for 7 days
  if (result) {
    await redisClient.set(cacheKey, JSON.stringify(result), {
      EX: 60 * 60 * 24 * 7, // 7 days
    });
  }

  return result;
};


// 3. GET ALL STATIC PAGES
const getAllStaticPages = async () => {

    // CHECK IF DATA EXISTS IN CACHE
    const cacheKey = `staticPage:all`;
    const cachedData = await redisClient.get(cacheKey);
  
    if(cachedData) {
      return JSON.parse(cachedData);
    }
  
    // DATABASE QUERY
  const result = await StaticPageModel.find({
    slug: { $in: STATIC_PAGES },
  });

  // CACHE DATA
  await redisClient.set(cacheKey, JSON.stringify(result), {
    EX: 60 * 60 * 24 * 7, // 7 days
  });

  return result;
};


// 4. UPDATE STATIC PAGE
const updateStaticPage = async (
  slug: string,
  payload: Partial<{
    title: string;
    content: string;
  }>
) => {
  if (!STATIC_PAGES.includes(slug)) {
    throw new Error('Invalid page slug');
  }

  const result = await StaticPageModel.findOneAndUpdate(
    { slug },
    payload,
    { new: true }
  );


  // INVALDATE CACHE
  await invalidateAllMachineryCache('staticPage:*');

  return result;
};

export const StaticPageService = {
  createStaticPage,
  getStaticPage,
  getAllStaticPages,
  updateStaticPage,
};