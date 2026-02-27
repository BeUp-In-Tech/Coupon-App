/* eslint-disable @typescript-eslint/no-unused-vars */
import { NextFunction, Request, Response } from "express";
import { CatchAsync } from "../../utils/CatchAsync";
import { SendResponse } from "../../utils/SendResponse";
import { StatusCodes } from "http-status-codes";
import { JwtPayload } from "jsonwebtoken";
import { voucherServices } from "./voucher.services";


// CREATE VOUCHER
const createVoucher = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user as JwtPayload;
    const payload = req.body;

    const result = await voucherServices.createVoucherService(user, payload);

    SendResponse(res, {
        success: true,
        statusCode: StatusCodes.CREATED,
        message: "Voucher created",
        data: result
    })
});


// GET ALL VOUCHER
const getAllVouchers = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const result = await voucherServices.getAllVouchersService();

    SendResponse(res, {
        success: true,
        statusCode: StatusCodes.OK,
        message: "All vouchers fetched",
        data: result
    })
});


// GET SINGLE VOUCHER
const getSingleVoucher = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const voucherId = req.params.voucherId as string;
    const result = await voucherServices.getSingleVoucherService(voucherId);

    SendResponse(res, {
        success: true,
        statusCode: StatusCodes.OK,
        message: "Voucher fetched",
        data: result
    })
});


// VOUCHER UPDATE
const updateVoucher = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const voucherId = req.params.voucherId as string;
    const user = req.user as JwtPayload;
    const payload = req.body;

    const result = await voucherServices.updateVoucherService(voucherId, payload, user);

    SendResponse(res, {
        success: true,
        statusCode: StatusCodes.OK,
        message: "Voucher updated",
        data: result
    })
});


// VOUCHER UPDATE
const deleteVoucher = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const voucherId = req.params.voucherId as string;
    const user = req.user as JwtPayload;

    const result = await voucherServices.deleteVoucherService(voucherId, user.role);

    SendResponse(res, {
        success: true,
        statusCode: StatusCodes.OK,
        message: "Voucher deleted",
        data: result
    })
});


// REDEEM VOUCHER
const applyVoucher = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user as JwtPayload;
    const voucherCode = req.query.voucher_code as string;
    const result = await voucherServices.applyVoucherService(user, voucherCode);

    SendResponse(res, {
        success: true,
        statusCode: StatusCodes.OK,
        message: "Voucher applied",
        data: result
    })
});



export const voucherControllers = {
    createVoucher,
    getAllVouchers,
    getSingleVoucher,
    updateVoucher,
    deleteVoucher,
    applyVoucher
}