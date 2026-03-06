import { Router } from 'express';
import { validateRequest } from '../../middlewares/validateRequest';
import {
  CreateDealZodSchema,
  UpdateDealZodSchema,
} from './deal.validate';
import { multerUpload } from '../../config/multer.config';
import { checkAuth } from '../../middlewares/auth.middleware';
import { Role } from '../user/user.interface';
import { dealsControllers } from './deal.controllers';


const router = Router();

// SERVICE CREATE
router.post(
  '/',
  checkAuth(Role.VENDOR),
  multerUpload.array('files'),
  validateRequest(CreateDealZodSchema),
  dealsControllers.createDeals
);

// GET ALL DEALS
router.get('/deals/all_deals/:lng/:lat', dealsControllers.getAllDeals);

// GET NEARESST DEALS
router.get('/deals/:lng/:lat', dealsControllers.getNearestDeals);

// GET MY SERVICE
router.get('/my_deals', checkAuth(Role.VENDOR), dealsControllers.getMyDeals);

// GET USERS SAVED DEALS
router.get('/saved', dealsControllers.getDealsByIds);

// GET SINGLE SERVICE
router.get(
  '/:serviceId',
  dealsControllers.getSingleDeals
);

// DELETE SERVICE
router.delete(
  '/:serviceId',
  checkAuth(Role.VENDOR),
  dealsControllers.deleteDeals
);

// UPDATE SERVICE
router.patch(
  '/:serviceId',
  checkAuth(Role.VENDOR),
  multerUpload.array('files'),
  validateRequest(UpdateDealZodSchema),
  dealsControllers.updateSingleDeals
);





export const serviceRouter = router;
