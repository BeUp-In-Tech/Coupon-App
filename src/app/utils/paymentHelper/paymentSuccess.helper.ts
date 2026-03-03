import mongoose from "mongoose";
import { PaymentModel } from "../../modules/payment/payment.model";
import { PaymentStatus } from "../../modules/payment/payment.interface";
import { Promotion } from "../../modules/promotion/promotion.model";
import { PromotionStatus } from "../../modules/promotion/promotion.interface";
import { Voucher } from "../../modules/voucher/voucher.model";
import Stripe from "stripe";
import AppError from "../../errorHelpers/AppError";
import { StatusCodes } from "http-status-codes";
import { DealModel } from "../../modules/deal/deal.model";


export const paymentSuccessHandler = async (session: Stripe.Checkout.Session) => {
    const dbSession = await mongoose.startSession();
    
          await dbSession.withTransaction(async () => {
            const payment = await PaymentModel.findOne({
              stripe_session_id: session.id,
            }).session(dbSession);
    
            if (!payment) return;
    
            // already processed (idempotent)
            if (payment.payment_status === PaymentStatus.PAID) return;
    
            const promotion = await Promotion.findById(payment.promotion).session(
              dbSession
            );
    
            if (!promotion) return;
    
            /* ---- UPDATE PAYMENT ---- */
            payment.payment_status = PaymentStatus.PAID;
            payment.payment_intent_id = session.payment_intent?.toString();
    
            await payment.save({ session: dbSession });
    
            /* ---- ACTIVATE PROMOTION ---- */
    
            const now = new Date();
            const endDate = new Date();
            endDate.setDate(endDate.getDate() + promotion.validityDays);
    
            promotion.status = PromotionStatus.ACTIVE;
            promotion.startAt = now;
            promotion.endAt = endDate;
    
            await promotion.save({ session: dbSession });


            /* ---- ADDED PROMOTION DURATION DIRECTLY IN DEALS OR SERVICE */
            const service = await DealModel.findOne({ _id: promotion.deal });
            if (!service) {
              throw new AppError(StatusCodes.NOT_FOUND, `Service not found`);
            }

            service.promotedUntil = endDate;
            service.isPromoted = true;
            service.activePromotion = promotion._id;

            await service.save({ session: dbSession });
    
            /* ---- VOUCHER DECREMENT (SAFE) ---- */
    
            if (payment.voucher_applied) {
              await Voucher.updateOne(
                {
                  code: payment.voucher_applied,
                  voucher_limit: { $gt: 0 },
                },
                { $inc: { voucher_limit: -1 } },
                { session: dbSession }
              );
            }
          });
    
}