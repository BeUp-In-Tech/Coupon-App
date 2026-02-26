import { Router } from 'express';
import { validateRequest } from '../../middlewares/validateRequest';
import {
  CreateServiceZodSchema,
  UpdateServiceZodSchema,
} from './service.validate';
import { multerUpload } from '../../config/multer.config';
import { checkAuth } from '../../middlewares/auth.middleware';
import { Role } from '../user/user.interface';
import { serviceControllers } from './service.controllers';

const router = Router();

// SERVICE CREATE
router.post(
  '/',
  checkAuth(Role.VENDOR),
  multerUpload.array('files'),
  validateRequest(CreateServiceZodSchema),
  serviceControllers.createService
);

// DELETE SERVICE
router.delete(
  '/:serviceId',
  checkAuth(Role.VENDOR),
  serviceControllers.deleteService
);
// UPDATE SERVICE
router.patch(
  '/:serviceId',
  checkAuth(Role.VENDOR),
  multerUpload.array('files'),
  validateRequest(UpdateServiceZodSchema),
  serviceControllers.updateService
);

export const serviceRouter = router;
