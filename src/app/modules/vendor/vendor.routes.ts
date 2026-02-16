import express from 'express';
import { validateRequest } from '../../middlewares/validateRequest';
import { vendorZodSchema } from './vendor.validate';
import { vendorControllers } from './vendor.controller';

const router = express.Router();

router.post('/register', validateRequest(vendorZodSchema), vendorControllers.registerVendor);

export const vendorRoutes = router;