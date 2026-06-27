import { Router } from 'express';
import { validateRequest } from '../../middlewares/validateRequest';
import {
  CreateDealZodSchema,
  UpdateDealZodSchema,
} from './deal.validate';
import { uploadMulter } from '../../config/multer.config';
import { checkAuth } from '../../middlewares/auth.middleware';
import { Role } from '../user/user.interface';
import { dealsControllers } from './deal.controller';
import { validateImageDimensions } from '../../middlewares/imageRatioValidation';
import { uploadToCloudinary } from '../../middlewares/uploadCloudinary';
import { preParseMiddleware } from '../../middlewares/helper.middleware';


const router = Router();

// SERVICE CREATE
router.post(
  '/',
  checkAuth(Role.VENDOR),
   uploadMulter.fields([
    { name: 'files', maxCount: 10 },
    { name: 'qr', maxCount: 1 },
    { name: 'upc', maxCount: 1 },
  ]),
  // validateImageDimensions,
  uploadToCloudinary,
  preParseMiddleware,
  validateRequest(CreateDealZodSchema),
  dealsControllers.createDeals
);

// SEARCH DEALS BY CURRENT OR SELECTED LOCATION
router.get('/deals/search', dealsControllers.searchDealsByLocation);

// GET ALL DEALS
router.get('/deals/all_deals/:lng/:lat', dealsControllers.getAllDeals);

// GET DEAL ANALYTICS
router.get('/deals/analytic/:dealId', checkAuth(Role.VENDOR), dealsControllers.dealAnalytics);

// GET NEAREST DEALS
router.get('/deals/:lng/:lat', dealsControllers.getNearestDeals);

// GET MY DEAL
router.get('/my_deals', checkAuth(Role.VENDOR), dealsControllers.getMyDeals);

// GET USERS SAVED DEAL
router.get('/saved', dealsControllers.getDealsByIds);

// GET SINGLE DEALS
router.get(
  '/:dealId/:lng/:lat',
  dealsControllers.getSingleDeals
);

// GET DEALS BY CATEGORY
router.get(
  '/c/:categoryId',
  dealsControllers.getDealsByCategory
);

// DELETE DEAL
router.delete(
  '/:dealId',
  checkAuth(Role.VENDOR),
  dealsControllers.deleteDeals
);

// UPDATE DEAL
router.patch(
  '/:dealId',
  checkAuth(Role.VENDOR),
  uploadMulter.fields([
    { name: 'files', maxCount: 10 },
    { name: 'qr', maxCount: 1 },
    { name: 'upc', maxCount: 1 },
  ]),
  validateImageDimensions,
  uploadToCloudinary,
  preParseMiddleware,
  validateRequest(UpdateDealZodSchema),
  dealsControllers.updateSingleDeals
);

// GET TOP VIEWED DEALS
router.get('/top_viewed_deals', checkAuth(Role.VENDOR), dealsControllers.topViewedDeals);





export const serviceRouter = router;
