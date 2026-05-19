import { Router } from 'express';
import { validateRequest } from '../../middlewares/validateRequest';
import {
  outletCreateZodSchema,
  outletUpdateZodSchema,
} from './outlet.validate';
import { checkAuth } from '../../middlewares/auth.middleware';
import { Role } from '../user/user.interface';
import { outletControllers } from './outlet.controller';

const router = Router();

// CREATE OUTLET
router.post(
  '/',
  checkAuth(Role.VENDOR),
  validateRequest(outletCreateZodSchema),
  outletControllers.createOutlet
);

// UPDATE OUTLET
router.patch(
  '/',
  checkAuth(...Object.keys(Role)),
  validateRequest(outletUpdateZodSchema),
  outletControllers.updateOutlet
);

export const outletRouter = router;
