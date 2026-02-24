import express from 'express';
import { validateRequest } from '../../middlewares/validateRequest';
import { registerSchema, unregisterSchema, userUpdateZodSchema, userZodSchema,   } from './user.validate';
import { userControllers } from './user.controller';
import { checkAuth } from '../../middlewares/auth.middleware';
import { Role } from './user.interface';

const router = express.Router();

// USER REGISTER
router.post('/register', validateRequest(userZodSchema), userControllers.registerUser);
// UPDATE USER
router.patch('/', validateRequest(userUpdateZodSchema), checkAuth(...Object.keys(Role)), userControllers.updateUser);
// GET ME
router.get('/get_me', checkAuth(...Object.keys(Role)), userControllers.getMe);
// SEND VERIFICATION OTP
router.post('/verification_otp', userControllers.sendVerificationOTP);
// VERIFY PROFILE
router.post('/verify_profile',  userControllers.verifyProfile);

// PUSH FCM
router.post('/register_fcm', validateRequest(registerSchema), checkAuth(...Object.keys(Role)), userControllers.registerPushToken);
router.patch('/unregister_fcm', validateRequest(unregisterSchema), checkAuth(...Object.keys(Role)), userControllers.unregisterPushToken);
router.get('/get_device', checkAuth(...Object.keys(Role)), userControllers.getMyDeviceList);


export const vendorRoutes = router;