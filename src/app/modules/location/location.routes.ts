import { Router } from 'express';
import { validateRequest } from '../../middlewares/validateRequest';
import { locationCreateZodSchema, locationUpdateZodSchema } from './location.validate';
import { checkAuth } from '../../middlewares/auth.middleware';
import { Role } from '../user/user.interface';
import { locationControllers } from './location.controller';
import { bulkLocationUpload } from '../../config/multer.config';


const router = Router();

router.get(
  '/bulk/template',
  checkAuth(Role.VENDOR),
  locationControllers.downloadBulkLocationTemplate
);

router.post(
  '/bulk/preview',
  checkAuth(Role.VENDOR),
  bulkLocationUpload.single('file'),
  locationControllers.previewBulkLocations
);

router.post(
  '/bulk/:batchId/confirm',
  checkAuth(Role.VENDOR),
  locationControllers.confirmBulkLocations
);

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
