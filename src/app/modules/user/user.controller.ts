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
        trace_id: req.id as string,
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
        trace_id: req.id as string,
        data: result
    })
});

const getMe = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user as JwtPayload;
    const result = await userServices.getMeService(user.userId);
    SendResponse(res, {
        success: true,
        statusCode: StatusCodes.OK,
        message: "Fetch my details",
        trace_id: req.id as string,
        data: result
    })
});


const sendVerificationOTP = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const { email } = req.body;
    const user = req.user as JwtPayload;
    const result = await userServices.sendVerificationOtpService(email, user);
    SendResponse(res, {
        success: true,
        statusCode: StatusCodes.OK,
        message: "6 digit OTP sent",
        trace_id: req.id as string,
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
        trace_id: req.id as string,
        data: result
    })
});


const deleteUserAccount = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const authUser = req.user as JwtPayload;
    const result = await userServices.deleteUserAccount(authUser);

    SendResponse(res, {
        success: true,
        statusCode: StatusCodes.OK,
        message: "User account deleted",
        trace_id: req.id as string,
        data: result
    })
});


const registerPushToken = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const payload = req.body;
    const { userId }= req.user as JwtPayload;
    const result = await userServices.registerPushTokenService(userId, payload);
    SendResponse(res, {
        success: true,
        statusCode: StatusCodes.OK,
        message: "Push device saved",
        trace_id: req.id as string,
        data: result
    })
});


const unregisterPushToken = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const { deviceId } = req.body;
    const { userId }= req.user as JwtPayload;
    const result = await userServices.unregisterPushTokenService(deviceId, userId);
    SendResponse(res, {
        success: true,
        statusCode: StatusCodes.OK,
        message: "Push device removed",
        trace_id: req.id as string,
        data: result
    })
});


const getMyDeviceList = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const { userId }= req.user as JwtPayload;
    const result = await userServices.listMyDevicesService(userId);
    SendResponse(res, {
        success: true,
        statusCode: StatusCodes.OK,
        message: "Push device list fetched",
        trace_id: req.id as string,
        data: result
    })
});



export const userControllers = {
    registerUser,
    updateUser,
    getMe,
    sendVerificationOTP,
    verifyProfile,
    deleteUserAccount,
    registerPushToken,
    unregisterPushToken,
    getMyDeviceList
}
