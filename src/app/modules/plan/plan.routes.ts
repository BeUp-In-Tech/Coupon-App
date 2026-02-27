import { Router } from 'express';
import { checkAuth } from '../../middlewares/auth.middleware';
import { Role } from '../user/user.interface';
import { planControllers } from './plan.controller';
import { validateRequest } from '../../middlewares/validateRequest';
import { planCreateZodSchema, planUpdateZodSchema } from './plan.validate';
import { multerUpload } from '../../config/multer.config';

const router = Router();

// CREATE PLAN
router.post(
  '/',
  checkAuth(Role.ADMIN),
  multerUpload.single('file'),
  validateRequest(planCreateZodSchema),
  planControllers.createPlan
);

// GET PLAN
router.get('/', planControllers.getPlan);

// UPDATE PLAN
router.patch(
  '/:planId',
  checkAuth(Role.ADMIN),
  multerUpload.single('file'),
  validateRequest(planUpdateZodSchema),
  planControllers.updatePlan
);

// DELETE PLAN
router.delete('/:planId', checkAuth(Role.ADMIN), planControllers.deletePlan);



export const planRouter = router;
