/* eslint-disable @typescript-eslint/no-explicit-any */
import { JwtPayload } from 'jsonwebtoken';
import { Role } from '../user/user.interface';
import AppError from '../../errorHelpers/AppError';
import { StatusCodes } from 'http-status-codes';
import { Plan } from '../plan/plan.model';
import { voucherServices } from '../voucher/voucher.services';
import { stripe } from '../../config/stripe.config';
import { Promotion } from '../promotion/promotion.model';
import mongoose, { Types } from 'mongoose';
import { Shop } from '../shop/shop.model';
import { PromotionStatus } from '../promotion/promotion.interface';
import { PaymentModel } from './payment.model';
import { generateTransactionId } from '../../utils/generateTransactionId';
import { PaymentProvider, PaymentStatus } from './payment.interface';
import env from '../../config/env';
import Stripe from 'stripe';
import { Request } from 'express';
import { paymentSuccessHandler } from '../../utils/paymentHelper/paymentSuccess.helper';
import { paymentFailedHandler } from '../../utils/paymentHelper/paymentFailed.helper';
import { DealModel } from '../deal/deal.model';

// HELPER INTERFACE

// STRIPE PAYMENT -> PROMOTE SERVICE
const stripePay = async (
  user: JwtPayload,
  _dealId: string,
  _planId: string,
  voucher: string
) => {
  const userId = new Types.ObjectId(user.userId);
  const dealId = new Types.ObjectId(_dealId);
  const planId = new Types.ObjectId(_planId);

  /* ---------- VALIDATION (OUTSIDE TRANSACTION) ---------- */
  if (user.role !== Role.VENDOR) {
    throw new AppError(StatusCodes.UNAUTHORIZED, "You can't promote service");
  }

  const [deal, plan, shop] = await Promise.all([
    DealModel.findById(dealId),
    Plan.findById(planId),
    Shop.findOne({ vendor: user.userId }),
  ]);

  if (!deal) throw new AppError(StatusCodes.NOT_FOUND, 'Deal not found');
  if (!plan) throw new AppError(StatusCodes.NOT_FOUND, 'Plan not found');
  if (!shop) throw new AppError(StatusCodes.NOT_FOUND, 'Shop not found');

  if (!deal.shop.equals(shop._id)) {
    throw new AppError(StatusCodes.FORBIDDEN, 'Invalid service');
  }

  // CHECK ALREADY PROMOTED
  const alreadyPromoted = await Promotion.findOne({
    user: userId,
    shop: shop._id,
    deal: dealId,
    status: {
      $in: [PromotionStatus.ACTIVE],
    },
  });

  if (alreadyPromoted) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'This service already promoted'
    );
  }

  /* ---------- PRICE CALCULATION ---------- */
  let final_price = Number(plan.price);
  const voucher_payload: Partial<{
    voucher_id: Types.ObjectId;
    voucher: string;
  }> = {};

  // APPLY VOUCHER, IF VOUCHER PROVIDE
  if (voucher) {
    try {
      const { voucher_id, discount_parcantage } =
        await voucherServices.applyVoucherService(user, voucher);

      // UPDATE FINAL PRICE
      final_price =
        final_price - (final_price / 100) * Number(discount_parcantage);
      voucher_payload.voucher_id = voucher_id;
      voucher_payload.voucher = voucher;
    } catch (err: any) {
      throw new AppError(StatusCodes.BAD_REQUEST, err.message);
    }
  }

  /* ---------- TRANSACTION START ---------- */

  const session = await mongoose.startSession();
  let payment: any;
  let promotion: any;
  try {
    session.startTransaction();

    const payment_id = new Types.ObjectId();

    promotion = await Promotion.create(
      [
        {
          user: userId,
          shop: shop._id,
          deal: deal._id,
          payment: payment_id,
          validityDays: plan.durationDays,
          price: final_price,
          status: PromotionStatus.PENDING,
        },
      ],
      { session }
    );

    payment = await PaymentModel.create(
      [
        {
          _id: payment_id,
          user: userId,
          deal: deal._id,
          promotion: promotion[0]._id,
          transaction_id: generateTransactionId(),
          amount: final_price,
          voucher_applied: voucher ?? null,
          provider: PaymentProvider.STRIPE,
          payment_status: PaymentStatus.PENDING,
        },
      ],
      { session }
    );

    await session.commitTransaction();
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }

  /* ---------- STRIPE SESSION ---------- */
  const totalAmountCents = Math.round(final_price * 100);

  const stripePayload = {
    payment_method_types: ['card'] as const,
    line_items: [
      {
        price_data: {
          currency: plan.currency.toLowerCase(),
          product_data: {
            name: deal.title,
            images: deal.images,
          },
          unit_amount: totalAmountCents,
        },
        quantity: 1,
      },
    ],
    mode: 'payment' as const,
    expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    metadata: {
      payment: payment[0]._id.toString(),
      promotion: promotion[0]._id.toString(),
      deal: dealId.toString(),
      voucher_id: voucher_payload.voucher_id?.toString() ?? '',
      voucher_code: voucher_payload.voucher ?? '',
    },
    success_url: `${env.FRONTEND_URL}/payment_success`,
    cancel_url: `${env.FRONTEND_URL}/payment_cancel`,
  } as Stripe.Checkout.SessionCreateParams;

  const idempotencyKey = {
    idempotencyKey: payment[0]._id.toString(),
  };

  // STRIPE CHECKOUT
  try {
    const stripeSession = await stripe.checkout.sessions.create(
      stripePayload,
      idempotencyKey
    );

    // UPDATE STRIPE SESSION ID FOR GET FROM WEBHOOK
    const updatePayment = PaymentModel.updateOne(
      { _id: payment[0]._id },
      { stripe_session_id: stripeSession.id }
    );

    const updatePromotion = Promotion.updateOne(
      { _id: promotion[0]._id },
      { stripe_session_id: stripeSession.id }
    );

    await Promise.all([updatePayment, updatePromotion]);

    return { checkout_url: stripeSession.url };
  } catch (error: any) {
    // IF ERROR MAKE DB UPDATE WITH FAILED AND CANCELED
    await PaymentModel.updateOne(
      { _id: payment[0]._id },
      { payment_status: PaymentStatus.FAILED }
    );

    await Promotion.updateOne(
      { _id: promotion[0]._id },
      { status: PromotionStatus.CANCELED }
    );

    throw new AppError(StatusCodes.BAD_GATEWAY, error.message);
  }
};

// WEBHOOK HANDLER
const stripeWebhookHandling = async (req: Request) => {
  const signature = req.headers['stripe-signature'] as string;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err: any) {
    throw new AppError(StatusCodes.BAD_REQUEST, `Webhook Error: ${err.message} `);
  }

  /* ---------- HANDLE EVENTS ---------- */
  switch (event.type) {
    /* PAYMENT SUCCESS */
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      await paymentSuccessHandler(session);
      break;
    }

    /* PAYMENT FAILED / EXPIRED */
    case 'checkout.session.expired':
    case 'payment_intent.payment_failed': {
      const session = event.data.object as Stripe.Checkout.Session;
      await paymentFailedHandler(session);
      break;
    }
  }

  return { received: true };
};

// EXPORT FUNCTION
export const paymentService = {
  stripePay,
  stripeWebhookHandling,
};
