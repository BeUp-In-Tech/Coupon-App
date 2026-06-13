import { Router } from 'express';
import { validateRequest } from '../../middlewares/validateRequest';
import {
  outletCreateZodSchema,
  outletUpdateZodSchema,
} from './location.validate';
import { checkAuth } from '../../middlewares/auth.middleware';
import { Role } from '../user/user.interface';
import { locationControllers } from './location.controller';


const router = Router();

// CREATE OUTLET
router.post(
  '/',
  checkAuth(Role.VENDOR),
  validateRequest(outletCreateZodSchema),
  locationControllers.createLocation
);

// UPDATE OUTLET
router.patch(
  '/',
  checkAuth(...Object.keys(Role)),
  validateRequest(outletUpdateZodSchema),
  locationControllers.updateLocation
);

export const locationRouter = router;
