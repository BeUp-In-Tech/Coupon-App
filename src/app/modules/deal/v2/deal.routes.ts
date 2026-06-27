import { Router } from 'express';
import { Role } from '../../user/user.interface';
import { checkAuth } from '../../../middlewares/auth.middleware';
import { uploadMulter } from '../../../config/multer.config';
import { uploadToCloudinary } from '../../../middlewares/uploadCloudinary';
import { preParseMiddleware } from '../../../middlewares/helper.middleware';
import { validateRequest } from '../../../middlewares/validateRequest';
import { validateImageDimensions } from '../../../middlewares/imageRatioValidation';
import { dealV2Controllers } from './deal.controller';
import {
  CreateDealV2ZodSchema,
  UpdateDealV2ZodSchema,
} from './deal.validate';

export const dealV2Router = Router();

const dealUploads = uploadMulter.fields([
  { name: 'files', maxCount: 10 },
  { name: 'qr', maxCount: 1 },
  { name: 'upc', maxCount: 1 },
]);

dealV2Router.post(
  '/',
  checkAuth(Role.VENDOR),
  dealUploads,
  uploadToCloudinary,
  preParseMiddleware,
  validateRequest(CreateDealV2ZodSchema),
  dealV2Controllers.createDeal
);

dealV2Router.patch(
  '/:dealId',
  checkAuth(Role.VENDOR),
  dealUploads,
  validateImageDimensions,
  uploadToCloudinary,
  preParseMiddleware,
  validateRequest(UpdateDealV2ZodSchema),
  dealV2Controllers.updateDeal
);
