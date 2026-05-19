import { Router } from 'express';
import { shopController } from './shop.controllers';
import { validateRequest } from '../../middlewares/validateRequest';
import {
  shopValidationSchema,
  updateShopValidationSchema,
} from './shop.validate';
import { checkAuth } from '../../middlewares/auth.middleware';
import { Role } from '../user/user.interface';
import { multerUpload } from '../../config/multer.config';

const router = Router();

// CREATE SHOP
router.post(
  '/create_shop',
  checkAuth(Role.VENDOR),
  multerUpload.single('file'),
  validateRequest(shopValidationSchema),
  shopController.createShop
);
// GET SHOP DETAILS
router.get('/shop_details', shopController.getShopDetails);
// UPDATE SHOP
router.patch(
  '/update_shop/:shopId',
  checkAuth(Role.VENDOR, Role.ADMIN),
  multerUpload.single('file'),
  validateRequest(updateShopValidationSchema),
  shopController.updateShop
);
// SHOP ANALYTICS
router.get(
  '/analytics',
  checkAuth(Role.VENDOR),
  shopController.getDealAnalytics
);
// SHOP MONTHLY ANALYTICS
router.get(
  '/yearly_analytics',
  checkAuth(Role.VENDOR),
  shopController.getPrevious3YearsMonthlyAnalytics
);

export const shopRouter = router;
