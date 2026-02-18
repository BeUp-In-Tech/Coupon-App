import { Router } from 'express';
import passport from 'passport';
import { authController } from './auth.controller';
import { checkAuth } from '../../middlewares/auth.middleware';
import { Role } from '../user/user.interface';

const router = Router();

// CREDENTIAL LOGIN
router.post('/login', authController.credentialsLogin);
// CHANGE PASSWORD
router.post('/change_password', checkAuth(...Object.keys(Role)), authController.changePassword);
// FORGET PASSWORD
router.get('/forget_password/:email', authController.forgetPassword);

// GOOGLE LOGIN
router.get('/google', authController.googleRegister);
router.get(
  '/google/callback',
  passport.authenticate('google', { failureRedirect: '/login' }),
  authController.googleCallback
);



export const authRouter = router;
