/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { NextFunction, Request, Response } from 'express';
import { CatchAsync } from '../../utils/CatchAsync';
import passport from 'passport';
import AppError from '../../errorHelpers/AppError';
import httpStatus, { StatusCodes } from 'http-status-codes';
import { SetCookies } from '../../utils/setCookie';
import { createUserTokens } from '../../utils/user.tokens';
import { JwtPayload } from 'jsonwebtoken';
import env from '../../config/env';
import { SendResponse } from '../../utils/SendResponse';
import { authService } from './auth.service';


// REGISTER WITH GOOGLE
const googleRegister = CatchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const redirect = (req.query?.redirect as string) || '/';

    passport.authenticate('google', {
      scope: ['profile', 'email'],
      state: redirect,
      prompt: 'consent select_account',
    })(req, res, next);
  }
);


//  GOOGLE CALLBACK
const googleCallback = CatchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    let redirectTo = req.query.state ? (req.query.state as string) : '';
    if (redirectTo.startsWith('/')) {
      redirectTo = redirectTo.slice(1);
    }

    const user = req.user as JwtPayload;
    if (!user) throw new AppError(httpStatus.BAD_REQUEST, 'User not found');

    const token = await createUserTokens(user);
    SetCookies(res, token);
    res.redirect(`${env.FRONTEND_URL}/${redirectTo}`); // Redirected to frontend url (With specific Routes)
  }
);


// CREDENTIAL LOGIN
const credentialsLogin = CatchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    passport.authenticate('local', async (err: any, user: any, info: any) => {
      if (err) next(err);

      if (!user) {
        return next(new AppError(httpStatus.FORBIDDEN, info.message));
      }

      const userTokens = await createUserTokens(user);

      SendResponse(res, {
        success: true,
        statusCode: httpStatus.OK,
        message: 'Login success',
        data: userTokens
      });
    })(req, res, next);
  }
);


// CHANGE PASSWORD
const changePassword = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
  const { userId } = req.user as JwtPayload;
  const { oldPassword, newPassword } = req.body;
  await authService.changePasswordService(userId, oldPassword, newPassword);
  
  SendResponse(res, {
    success: true,
    statusCode: StatusCodes.OK,
    message: "Password has been changed",
    data: null
  })
})

export const authController = {
  googleRegister,
  googleCallback,
  credentialsLogin,
  changePassword
};
