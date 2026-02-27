import { Router } from 'express';
import { checkAuth } from '../../middlewares/auth.middleware';
import { Role } from '../user/user.interface';
import { voucherControllers } from './voucher.controller';
import { validateRequest } from '../../middlewares/validateRequest';
import {
  voucherUpdateValidationSchema,
  voucherValidationSchema,
} from './voucher.validate';

const router = Router();

// CREATE VOUCHER
router.post(
  '/',
  checkAuth(Role.ADMIN),
  validateRequest(voucherValidationSchema),
  voucherControllers.createVoucher
);

// GET ALL VOUCHERS
router.get('/', checkAuth(Role.ADMIN), voucherControllers.getAllVouchers);

// APPLY VOUCHER
router.get(
  '/apply_voucher',
  checkAuth(...Object.keys(Role)),
  voucherControllers.applyVoucher
);

// GET SINGLE VOUCHERS
router.get(
  '/:voucherId',
  checkAuth(Role.ADMIN),
  voucherControllers.getSingleVoucher
);

// UPDATE VOUCHER
router.patch(
  '/:voucherId',
  checkAuth(Role.ADMIN),
  validateRequest(voucherUpdateValidationSchema),
  voucherControllers.updateVoucher
);


// DELETE VOUCHER
router.delete(
  '/:voucherId',
  checkAuth(Role.ADMIN),
  voucherControllers.deleteVoucher
);




export const voucherRouter = router;
