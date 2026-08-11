/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { NextFunction, Request, Response } from 'express';
import { CatchAsync } from '../../utils/CatchAsync';
import passport from 'passport';
import AppError from '../../errorHelpers/AppError';
import httpStatus, { StatusCodes } from 'http-status-codes';
import { createUserTokens } from '../../utils/user.tokens';
import { JwtPayload } from 'jsonwebtoken';
import env from '../../config/env';
import { SendResponse } from '../../utils/SendResponse';
import { authService } from './auth.service';
import {
  verifyAppleIdToken,
} from './auth.utility';
import User from '../user/user.model';
import { IsActiveUser, Role } from '../user/user.interface';

// REGISTER WITH GOOGLE
const googleRegister = CatchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const redirect = (req.query?.redirectTo as string) || '/';

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

    const userAgent = req.headers['user-agent'] || '';
    const isAndroid = /android/i.test(userAgent);
    const isIOS = /iphone|ipad|ipod/i.test(userAgent);

    const isAppRequest = redirectTo === 'app' || redirectTo === 'mobile' || req.query.platform === 'app';

    if (isAppRequest && (isAndroid || isIOS)) {
      const baseDeepLink = env.DEEP_LINK.replace(/\/+$/, '');
      res.redirect(
        `${baseDeepLink}/auth/google?access=${token.accessToken}&refresh=${token.refreshToken}`
      );
    } else {
      res.redirect(
        `${env.FRONTEND_URL}/login?access=${token.accessToken}&refresh=${token.refreshToken}`
      );
    }
  }
);

// REGISTER WITH GOOGLE FOR APPLE DEVICE
const googleAuthSystem = CatchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const result = await authService.googleAuthSystem(req.body);

    SendResponse(res, {
      success: true,
      statusCode: 200,
      message: 'Authentication success',
      trace_id: req.id as string,
      data: result,
    })
  }
);



// APPLE CALLBACK
const appleCallback = CatchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    
    const data = req.body;
    const authorizationCode = data?.code;
    const id_token = data?.id_token;


    if (!authorizationCode) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        'Apple authorization code is required'
      );
    }

    const clientId = env.APPLE_WEB_CLIENT_ID;
    if (
      ![env.APPLE_IOS_CLIENT_ID, env.APPLE_WEB_CLIENT_ID].includes(clientId)
    ) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid Apple client id');
    }

    // const identityToken = tokenResponse?.id_token as string;
    const identityToken = id_token as string;
    if (!identityToken) {
      throw new AppError(
        StatusCodes.UNAUTHORIZED,
        'Apple identity token is missing after code exchange'
      );
    }

    // Verify Apple identity token signature & claims
    const payload = await verifyAppleIdToken(identityToken, clientId);
    

    // payload.sub is Apple unique user ID
    const appleUserId = payload?.sub;
    if (!appleUserId) {
      throw new AppError(
        StatusCodes.UNAUTHORIZED,
        'Apple user id not found in token'
      );
    }

    const userEmail = (payload?.email || '').toLowerCase().trim();

    let user = await User.findOne({
      auths: {
        $elemMatch: {
          provider: 'apple',
          providerId: appleUserId,
        },
      },
    });

    if (!user && userEmail) {
      user = await User.findOne({ email: userEmail });
      if (user) {
        const alreadyLinked = user.auths?.some(
          (provider) =>
            provider.provider === 'apple' && provider.providerId === appleUserId
        );

        if (!alreadyLinked) {
          user.auths = user.auths || [];
          user.auths.push({
            provider: 'apple',
            providerId: appleUserId,
          });
        }
        user.isVerified = true;
        await user.save();
      }
    }

    if (!user) {
      if (!userEmail) {
        throw new AppError(
          StatusCodes.BAD_REQUEST,
          "Apple didn't return email. Please share email on first Apple sign-in and retry."
        );
      }



      // IF FIRST LOGIN AND APPLE PROVIDED USER INFO
      const rawUser = req.body?.user;
 
      let userInfo: Partial<{
        email: string;
        name: { firstName: string; lastName: string };
      }> = {};

      if (typeof rawUser === "string" && rawUser.trim() !== "") {
        try {
          userInfo = JSON.parse(rawUser);
        } catch {
          userInfo = {}; // prevent crash
        }
      } else if (rawUser && typeof rawUser === "object") {
        userInfo = rawUser; // if already parsed object
      }


      // safe reads (fallback to saved DB user if needed)
      const email = userInfo?.email ;
      const firstName = userInfo.name?.firstName; 
      const lastName = userInfo.name?.lastName;


      const userNameFromRequest =
        typeof `${firstName} ${lastName}` === 'string'
          ? `${firstName} ${lastName}`
          : '';

      const fallbackName = userEmail ? userEmail.split('@')[0] : email?.split('@')[0] || 'Apple User';
      const name = userInfo.name ? userNameFromRequest : fallbackName;

      user = await User.create({
        user_name: name,
        email: userEmail || email,
        role: Role.VENDOR,
        isVerified: true,
        auths: [
          {
            provider: 'apple',
            providerId: appleUserId,
          },
        ],
      });
    }
    

    if (user.isDeleted) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'User was deleted!');
    }

    if (
      user.isActive === IsActiveUser.INACTIVE ||
      user.isActive === IsActiveUser.BLOCKED
    ) {
      throw new AppError(StatusCodes.BAD_REQUEST, `User is ${user.isActive}`);
    }

    const userTokens = await createUserTokens({
      _id: user._id,
      email: user.email,
      role: user.role,
    } as JwtPayload);

    res.redirect(
        `${env.FRONTEND_URL}/login?access=${userTokens.accessToken}&refresh=${userTokens.refreshToken}`
      );
  }
);

// APPLE LOGIN
const appleLogin = CatchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { code, user_name, email } = req.body;
    const result = await authService.appleLoginService(code, user_name, email);
 

    SendResponse(res, {
      success: true,
      statusCode: StatusCodes.OK,
      message: 'Authentication success',
      trace_id: req.id as string,
      data: result,
    });
  }
);

const credentialsLogin = CatchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    passport.authenticate('local', async (err: any, user: any, info: any) => {
      if (err) next(err);

      if (!user) {
        return next(new AppError(httpStatus.UNAUTHORIZED, info.message));
      }

      const userTokens = await createUserTokens(user);

      SendResponse(res, {
        success: true,
        statusCode: httpStatus.OK,
        message: 'Login success',
        trace_id: req.id as string,
        data: userTokens,
      });
    })(req, res, next);
  }
);

// CHANGE PASSWORD
const changePassword = CatchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { userId } = req.user as JwtPayload;
    const { oldPassword, newPassword } = req.body;
    await authService.changePasswordService(userId, oldPassword, newPassword);

    SendResponse(res, {
      success: true,
      statusCode: StatusCodes.OK,
      message: 'Password has been changed',
      trace_id: req.id as string,
      data: null,
    });
  }
);

// FORGET PASSWORD
const forgetPassword = CatchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { email } = req.params;
    const result = await authService.forgetPasswordService(email as string);

    SendResponse(res, {
      success: true,
      statusCode: StatusCodes.OK,
      message: 'Password reset OTP sent',
      trace_id: req.id as string,
      data: result,
    });
  }
);

// VERIFY FORGET PASSWORD OTP
const verifyForgetPasswordOTP = CatchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { email, otp } = req.body;
    const result = await authService.verifyForgetPasswordOTPService(
      email as string,
      otp
    );

    SendResponse(res, {
      success: true,
      statusCode: StatusCodes.OK,
      message: 'OTP verified',
      trace_id: req.id as string,
      data: result,
    });
  }
);

// VERIFY FORGET PASSWORD OTP
const resetPassword = CatchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const token = req.headers.token as string;

    const { newPassword } = req.body;
    const result = await authService.resetPasswordService(token, newPassword);

    SendResponse(res, {
      success: true,
      statusCode: StatusCodes.OK,
      message: 'Password reset success',
      trace_id: req.id as string,
      data: result,
    });
  }
);

// VERIFY FORGET PASSWORD OTP
const getNewAccessToken = CatchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { refreshToken } = req.body;
    const result = await authService.getNewAccessTokenService(refreshToken);

    SendResponse(res, {
      success: true,
      statusCode: StatusCodes.OK,
      message: 'New access token generated',
      trace_id: req.id as string,
      data: result,
    });
  }
);

export const authController = {
  googleRegister,
  googleCallback,
  credentialsLogin,
  changePassword,
  forgetPassword,
  verifyForgetPasswordOTP,
  resetPassword,
  getNewAccessToken,
  appleCallback,
  appleLogin,
  googleAuthSystem
};
