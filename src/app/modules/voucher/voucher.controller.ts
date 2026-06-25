/* eslint-disable @typescript-eslint/no-unused-vars */
import { NextFunction, Request, Response } from "express";
import { CatchAsync } from "../../utils/CatchAsync";
import { SendResponse } from "../../utils/SendResponse";
import { StatusCodes } from "http-status-codes";
import { JwtPayload } from "jsonwebtoken";
import { voucherServices } from "./voucher.service";


// CREATE VOUCHER
const createVoucher = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user as JwtPayload;
    const payload = req.body;

    const result = await voucherServices.createVoucherService(user, payload);

    SendResponse(res, {
        success: true,
        statusCode: StatusCodes.CREATED,
        message: "Voucher created",
        trace_id: req.id as string,
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
        trace_id: req.id as string,
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
        trace_id: req.id as string,
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
        trace_id: req.id as string,
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
        trace_id: req.id as string,
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
        trace_id: req.id as string,
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
