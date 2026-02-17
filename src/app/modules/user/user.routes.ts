import express from 'express';
import { validateRequest } from '../../middlewares/validateRequest';
import { userUpdateZodSchema, userZodSchema,   } from './user.validate';
import { userControllers } from './user.controller';
import { checkAuth } from '../../middlewares/auth.middleware';
import { Role } from './user.interface';

const router = express.Router();

router.post('/register', validateRequest(userZodSchema), userControllers.registerUser);
router.patch('/', validateRequest(userUpdateZodSchema), checkAuth(...Object.keys(Role)), userControllers.updateUser);
router.post('/verification_otp', userControllers.sendVerificationOTP);
router.post('/verify_profile',  userControllers.verifyProfile);

export const vendorRoutes = router;