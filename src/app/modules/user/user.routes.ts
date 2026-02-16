import express from 'express';
import { validateRequest } from '../../middlewares/validateRequest';
import { vendorZodSchema } from './user.validate';
import { userControllers } from './user.controller';

const router = express.Router();

router.post('/register', validateRequest(vendorZodSchema), userControllers.registerVendor);

export const vendorRoutes = router;