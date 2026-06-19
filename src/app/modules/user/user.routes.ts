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
router.patch('/', checkAuth(...Object.keys(Role)), validateRequest(userUpdateZodSchema), userControllers.updateUser);
// GET ME
router.get('/get_me', checkAuth(...Object.keys(Role)), userControllers.getMe);
// SEND VERIFICATION OTP
router.post('/verification_otp', checkAuth(...Object.keys(Role)), userControllers.sendVerificationOTP);
// VERIFY PROFILE
router.post('/verify_profile', checkAuth(...Object.keys(Role)),  userControllers.verifyProfile);
// DELETE USER ACCOUNT
router.delete('/delete_account', checkAuth(...Object.keys(Role)), userControllers.deleteUserAccount);

// PUSH FCM
router.post('/register_fcm', checkAuth(...Object.keys(Role)), validateRequest(registerSchema), userControllers.registerPushToken);
router.patch('/unregister_fcm', checkAuth(...Object.keys(Role)), validateRequest(unregisterSchema), userControllers.unregisterPushToken);
router.get('/get_device', checkAuth(...Object.keys(Role)), userControllers.getMyDeviceList);


export const vendorRoutes = router;
