 import { JwtPayload } from 'jsonwebtoken';
import { Currency, IPlan } from './plan.interface';
import { Role } from '../user/user.interface';
import AppError from '../../errorHelpers/AppError';
import { StatusCodes } from 'http-status-codes';
import { Plan } from './plan.model';
import { asynSingleImageDelete } from '../../utils/singleImageDeleteAsync';

// ========1.CREATE PLAN========
const createPlanService = async (authUser: JwtPayload, payload: IPlan) => {
  // ENSURE USER IS ADMIN
  if (authUser.role !== Role.ADMIN) {
    // Delete image if error occured
    if (payload.icon) {
      await asynSingleImageDelete(payload.icon);
    }

    // Throw Error
    throw new AppError(StatusCodes.UNAUTHORIZED, 'Your are unauthorized');
  }


  // CHECK IF ALREADY A PLAN EXIST BY THE SAME DURATION
  const isPlan = await Plan.findOne({ durationDays: payload.durationDays });
  if (isPlan) {
    if (payload.icon) {
      await asynSingleImageDelete(payload.icon); // Delete image
    }
    throw new AppError(StatusCodes.BAD_REQUEST, "Already a plan exist by same duration");
  }


  // ENSURE PRICE IS NOT NEGATIVE OR DECIMAL
  if (payload.price < 0 || !Number.isInteger(payload.price)) {
    // Delete image if error occured
    if (payload.icon) {
      await asynSingleImageDelete(payload.icon);
    }

    // Throw Error
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "Price shouldn't be negative or decimal"
    );
  }

  // ENSURE DAYS IS NOT NEGATIVE OR DECIMAL
  if (payload.durationDays < 0 || !Number.isInteger(payload.durationDays)) {
    // Delete image if error Role is not ADMIN
    if (payload.icon) {
      await asynSingleImageDelete(payload.icon);
    }

    // Throw Error
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "Days shouldn't be negative or decimal"
    );
  }

  // CREATE PLAN
  const plan = await Plan.create(payload);
  return plan;
};

// ========2.GET PLAN===========
const getPlanService = async () => await Plan.find();

// ========3.UPDATE PLAN=======
const updatePlanService = async (user: JwtPayload, planId: string, payload: Partial<IPlan>) => {
  // AUTHENTICATED USER IS ADMIN
  if (user.role !== Role.ADMIN) {
    if (payload.icon) {
      await asynSingleImageDelete(payload.icon); // Delete image
    }
    

    // Throw Error
    throw new AppError(StatusCodes.UNAUTHORIZED, "You can't update plan");
  }


  // IF CURRENCY UPDATE: CHECK CURRENCY TYPE
 if (payload.currency) {
   if (payload.currency !== Currency.USD && payload.currency !== Currency.EUR) {
     if (payload.icon) {
      await asynSingleImageDelete(payload.icon); // Delete image
    }
    throw new AppError(StatusCodes.BAD_REQUEST, `Currency must be ${Currency.USD} or ${Currency.EUR}`)
  }
 }


  // FIND THE PLAN BY ID
  const plan = await Plan.findById(planId);
  if (!plan) {
    if (payload.icon) {
        await asynSingleImageDelete(payload.icon);
    }
    throw new AppError(StatusCodes.NOT_FOUND, "Plan not found");
  }



  // UPDATE THE PLAN WITH THE NEW DATA
  const updatedPlan = await Plan.findByIdAndUpdate(
    planId,
    {
      $set: payload, // Update only the fields present in payload
    },
    { new: true, runValidators: true }
  );

  if (!updatedPlan) {
    throw new AppError(StatusCodes.INTERNAL_SERVER_ERROR, "Failed to update plan");
  }

  // IF NEW ICON PROVIDED, DELETE OLD ICON
  if (payload.icon && payload.icon === updatedPlan.icon) {
    await asynSingleImageDelete(plan.icon); 
  }


  // RETURN THE UPDATED PLAN
  return updatedPlan;
};

// =======4.DELETE PLAN==========
const deletePlanService = async (user: JwtPayload, planId: string) => {

  // USER MUST BE ADMIN
  if (user.role !== Role.ADMIN) {
    throw new AppError(StatusCodes.UNAUTHORIZED, "You can't delete this plan");
  }

  // CHECKING IS PLAN EXIST BY ID
  const isPlan = await Plan.findById(planId);
  if (!isPlan) {
    throw new AppError(StatusCodes.NOT_FOUND, "Plan not found");
  }

  // PLAN DELETED HERE
  await Plan.findByIdAndDelete(planId);
  return null
}



export const planServices = {
  createPlanService,
  getPlanService,
  updatePlanService,
  deletePlanService
};
