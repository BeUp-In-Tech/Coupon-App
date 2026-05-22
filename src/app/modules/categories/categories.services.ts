import { StatusCodes } from 'http-status-codes';
import AppError from '../../errorHelpers/AppError';
import User from '../user/user.model';
import { ICategories } from './categories.interface';
import { Category } from './categories.model';
import { Role } from '../user/user.interface';
import { redisClient } from '../../config/redis.config';
import { addImageDeleteJob } from '../../utils/imageDeleteJobAdd';

// CATEGORY CACHE KEY FOR  CATEGORY DATA
const cacheKey = `categories`;

// CREATE CATEGORY
const createCategoryService = async (
  userId: string,
  payload: Partial<ICategories>
) => {
  // Check user existence
  const user = await User.findById(userId).select('role').lean();
  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, 'User not found!');
  }

  // Only admin can create category
  if (user.role !== Role.ADMIN) {
    throw new AppError(StatusCodes.FORBIDDEN, 'Only admin can create category');
  }

  // Check category exist by same name
  const isExist = await Category.findOne({
    category_name: payload.category_name,
  }).lean();
  if (isExist) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'Category already exist by this name'
    );
  }

  // Create
  const category = await Category.create(payload);

  // Clear old redis data
  await redisClient.del(cacheKey);

  // Return created final data
  return category;
};

// GET ALL CATEGORIES
const getCategoriesService = async (isDeleted: boolean) => {
  // SEND RESPONSE FROM REDIS
  const getRedisCategories = await redisClient.get(cacheKey);
  if (getRedisCategories) {
    return JSON.parse(getRedisCategories);
  }

  const categories = await Category.find({ isDeleted });

  // Store data in redis
  await redisClient.set(cacheKey, JSON.stringify(categories), {
    EX: 10 * 60, // 10 min
  });

  // Return final data
  return categories;
};

// UPDATE CATEGORY
const updateCategoryService = async (
  categoryId: string,
  userId: string,
  payload: Partial<ICategories>
) => {
  const user = await User.findById(userId).lean();
  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, 'User not found');
  }

  // Only admin can create category
  if (user.role !== Role.ADMIN) {
    throw new AppError(StatusCodes.FORBIDDEN, 'Only admin can create category');
  }

  const update = await Category.findByIdAndUpdate(categoryId, payload);


  // DELETE OLD IMAGE
  if (payload.category_image && update?.category_image) {
    await addImageDeleteJob([update.category_image as string]);
  }

  // Clear old redis data
  await redisClient.del(cacheKey);

  // Return updated data
  return update;
};

// DELETE CATEGORY
const deleteCategoryService = async (userId: string, categoryId: string) => {
  const user = await User.findById(userId).select('role').lean();
  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, 'User not found');
  }

  // Only admin can create category
  if (user.role !== Role.ADMIN) {
    throw new AppError(StatusCodes.FORBIDDEN, 'Only admin can create category');
  }

  const deleteCategory = await Category.findByIdAndUpdate(
    categoryId,
    { isDeleted: true },
    { runValidators: true, new: true }
  );

  // Clear old redis data
  await redisClient.del(cacheKey);

  // Return delete response
  return deleteCategory;
};

export const categoryServices = {
  createCategoryService,
  getCategoriesService,
  updateCategoryService,
  deleteCategoryService,
};
