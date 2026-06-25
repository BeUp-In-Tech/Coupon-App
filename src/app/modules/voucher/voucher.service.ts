import { JwtPayload } from "jsonwebtoken";
import { IVoucher } from "./voucher.interface";
import { Role } from "../user/user.interface";
import AppError from "../../errorHelpers/AppError";
import { StatusCodes } from "http-status-codes";
import { Voucher } from "./voucher.model";


// CREATE VOUCHER
const createVoucherService = async (user: JwtPayload, payload: IVoucher) => {
    if (user.role !== Role.ADMIN) {
        throw new AppError(StatusCodes.UNAUTHORIZED, "Only admin can create voucher");
    }

    const voucher = await Voucher.create(payload);
    return voucher;
}

// GET ALL VOUCHERS
const getAllVouchersService = async () => {
  return await Voucher.find().sort({ createdAt: -1 }).lean();
};

// GET SINGLE VOUCHER
const getSingleVoucherService = async (voucherId: string) => {
  // FIND VOUCHER BY ID
  const voucher = await Voucher.findById(voucherId).lean();

  if (!voucher) {
    throw new Error("VOUCHER_NOT_FOUND");
  }

  return voucher;
};

// UPDATE SINGLE VOUCHER (ADMIN ONLY)
const updateVoucherService = async (
  voucherId: string,
  payload: Partial<IVoucher>,
  user: JwtPayload
) => {
  // ALLOW ONLY ADMIN
  if (user.role !==  Role.ADMIN) {
    throw new Error("FORBIDDEN");
  }

  const updatedVoucher = await Voucher.findByIdAndUpdate(
    voucherId,
    payload,
    {
      new: true,
      runValidators: true,
    }
  ).lean();

  if (!updatedVoucher) {
    throw new Error("VOUCHER_NOT_FOUND");
  }

  return updatedVoucher;
};


// DELETE VOUCHER
const deleteVoucherService = async (
  voucherId: string,
  userRole: string
) => {
  // ALLOW ONLY ADMIN
  if (userRole !== "ADMIN") {
    throw new Error("FORBIDDEN");
  }

  // DELETE VOUCHER
  const deletedVoucher = await Voucher.findByIdAndDelete(voucherId).lean();

  if (!deletedVoucher) {
    throw new Error("VOUCHER_NOT_FOUND");
  }

  return deletedVoucher;
};

// REDEEM VOUCHER
const applyVoucherService = async (user: JwtPayload, voucherCode: string) => {

    if (user.role !== Role.VENDOR && user.role !== Role.ADMIN) {
        throw new AppError(StatusCodes.FORBIDDEN, "FORBIDDEN");
    }

  // FIND ACTIVE VOUCHER
  const voucher = await Voucher.findOne({
    voucher_code: voucherCode.toUpperCase(),
  });

  if (!voucher) {
    throw new Error("INVALID_VOUCHER");
  }

  // CHECK EXPIRY
  if (voucher.voucher_validity < new Date()) {
    throw new Error("VOUCHER_EXPIRED");
  }

  // CHECK LIMIT
  if (voucher.voucher_limit <= 0) {
    throw new Error("VOUCHER_LIMIT_EXCEEDED");
  }


  return  {
    voucher_id: voucher._id,
    discount_parentage: voucher.voucher_discount,
    voucher_code: voucher.voucher_code
  };
};


export const voucherServices = {
    createVoucherService,
    getAllVouchersService,
    getSingleVoucherService,
    updateVoucherService,
    deleteVoucherService,
    applyVoucherService
}