/* eslint-disable @typescript-eslint/no-unused-vars */
import { NextFunction, Request, Response } from "express";
import { CatchAsync } from "../../utils/CatchAsync";
import { SendResponse } from "../../utils/SendResponse";
import { StatusCodes } from "http-status-codes";
import { userServices } from "./user.service";
import { JwtPayload } from "jsonwebtoken";



const registerUser = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const result = await userServices.registerUserService(req.body);
    SendResponse(res, {
        success: true,
        statusCode: StatusCodes.CREATED,
        message: "User created!",
        data: result
    })
});

const updateUser = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user as JwtPayload;
    const result = await userServices.updateUserService(user, req.body);
    SendResponse(res, {
        success: true,
        statusCode: StatusCodes.OK,
        message: "User updated!",
        data: result
    })
});


const sendVerificationOTP = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const { email } = req.body;
    const result = await userServices.sendVerificationOtpService(email);
    SendResponse(res, {
        success: true,
        statusCode: StatusCodes.OK,
        message: "6 digit OTP sent",
        data: result
    })
});


const verifyProfile = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const {email, otp} = req.body;
    const result = await userServices.verifyUserProfileService(email, otp);
    SendResponse(res, {
        success: true,
        statusCode: StatusCodes.OK,
        message: "Profile verified",
        data: result
    })
});



export const userControllers = {
    registerUser,
    updateUser,
    sendVerificationOTP,
    verifyProfile
}