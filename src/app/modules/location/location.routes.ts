import { Router } from 'express';
import { validateRequest } from '../../middlewares/validateRequest';
import { locationCreateZodSchema, locationUpdateZodSchema } from './location.validate';
import { checkAuth } from '../../middlewares/auth.middleware';
import { Role } from '../user/user.interface';
import { locationControllers } from './location.controller';


const router = Router();

// CREATE Location
router.post(
  '/',
  checkAuth(Role.VENDOR),
  validateRequest(locationCreateZodSchema),
  locationControllers.createLocation
);

// UPDATE Location
router.patch(
  '/',
  checkAuth(...Object.keys(Role)),
  validateRequest(locationUpdateZodSchema),
  locationControllers.updateLocation
);

export const locationRouter = router;
