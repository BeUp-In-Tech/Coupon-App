import { Router } from 'express';
import { checkAuth } from '../../middlewares/auth.middleware';
import { Role } from '../user/user.interface';
import { planControllers } from './plan.controller';
import { validateRequest } from '../../middlewares/validateRequest';
import { planCreateZodSchema } from './plan.validate';
import { multerUpload } from '../../config/multer.config';

const router = Router();

router.post(
  '/',
  checkAuth(Role.ADMIN),
  multerUpload.single('file'),
  validateRequest(planCreateZodSchema),
  planControllers.createPlan
);

export const planRouter = router;
