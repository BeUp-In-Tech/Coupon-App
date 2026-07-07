/* eslint-disable @typescript-eslint/no-explicit-any */
import { google } from "googleapis";
import { StatusCodes } from "http-status-codes";
import { importX509, jwtVerify } from "jose";
import env from "../../config/env";
import AppError from "../../errorHelpers/AppError";
import { Promotion } from "../promotion/promotion.model";
import { PromotionStatus } from "../promotion/promotion.interface";
import Stripe from "stripe";
import { PaymentModel } from "./payment.model";
import { PaymentFailureFilter, PaymentStatus } from "./payment.interface";
import { addInvoiceGenerationJob, IInvoiceGenerationJobData } from "../../queue/job/invoice.job";
import mongoose from "mongoose";
import { DealModel } from "../deal/v1/deal.model";
import { scheduleDealJobs } from "../../queue/job/deal.job";
import { Voucher } from "../voucher/voucher.model";
import { Shop } from "../shop/shop.model";
import User from "../user/user.model";
import { Category } from "../categories/categories.model";
import { Location } from "../location/location.model";
import { InvoiceData } from "../../utils/invoice/invoicePdf.utility";
import { invalidateAllMachineryCache } from "../../utils/deleteCachedData";
import { redisClient } from "../../config/redis.config";
import { LoggerModule, paymentLogger } from "../../utils/logger/logger.child";

export const getStripeObjectId = (
  value: string | { id?: string } | null | undefined
) => {
  if (!value) return undefined;
  return typeof value === 'string' ? value : value.id;
};

export const ensureDealCanBePromoted = (deal: {
  isBanned?: boolean;
}) => {
  if (
    deal.isBanned === true
  ) {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      'This deal is banned by admin and cannot be promoted',
      LoggerModule.PAYMENT
    );
  }
};





/// -------------------------PAYMENT RELATED UTILITY---------------------------
// VALIDATE ANDROID
export const validateAndroid = async (productId: string, purchaseToken: string) => {
  try {
    if (!process.env.GOOGLE_SERVICE_ACCOUNT) {
      throw new AppError(
        StatusCodes.INTERNAL_SERVER_ERROR,
        `Env required: ${process.env.GOOGLE_SERVICE_ACCOUNT}`,
        LoggerModule.PAYMENT
      );
    }
    const credentials = JSON.parse(
      process.env.GOOGLE_SERVICE_ACCOUNT as string
    );
    credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/androidpublisher'],
    });

    const publisher = google.androidpublisher({
      version: 'v3',
      auth,
    });

    const res = await publisher.purchases.products.get({
      packageName: 'agency.beuptech.yepp',
      productId,
      token: purchaseToken,
    });

    const data = res.data as any;

    return (
      data.purchaseState === 0 && // purchased
      data.acknowledgementState === 1 // acknowledged
    );
  } catch (error: any) {
    paymentLogger.error({error}, 'Android In app purchase error');
    return false;
  }
}

// VALIDATE IOS
export const validateIOS = async (signedTransactionInfo: string) => {
  try {
    // 1. SPLIT JWS INTO PARTS
    const [headerB64] = signedTransactionInfo.split('.');

    // 2. DECODE HEADER (BASE64 -> JSON)
    const header = JSON.parse(
      Buffer.from(headerB64, 'base64').toString('utf-8')
    );

    if (!header.x5c || !header.x5c.length) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        'Missing Apple certificate chain (x5c)',
        LoggerModule.PAYMENT
      );
    }

    // 3. GET APPLE LEAF CERTIFICATE (FIRST CERT IN CHAIN)
    const leafCert = header.x5c[0];

    /**
     * CONVERT CERTIFICATE TO PEM FORMAT
     * APPLE GIVES BASE63 DER -> WE CONVERT TO PEM
     */
    const pem = `-----BEGIN CERTIFICATE-----\n${leafCert}\n-----END CERTIFICATE-----`;

    // 4. IMPORT PUBLIC KEY FROM CERTIFICATE
    const publicKey = await importX509(pem, 'ES256');

    // 5. VERIFY JWS SIGNATURE
    const { payload } = await jwtVerify(signedTransactionInfo, publicKey, {
      algorithms: ['ES256'],
    });

    // 6. (IMPORTANT) VALIDATE APP-SPECIFIC FIELDS
    if (payload.bundleId !== env.APPLE_IOS_CLIENT_ID) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        'Invalid bundleId',
        LoggerModule.PAYMENT
      );
    }

    // 🎉 7. Return verified transaction
    return {
      valid: true,
      data: payload,
    };
  } catch (error: any) {
    paymentLogger.error({ error }, 'Apple JWS verification failed');

    return {
      valid: false,
      error: error.message,
    };
  }
};

// PAYMENT SUCCESS HANDLER
export const paymentSuccessHandler = async (
  session: Stripe.Checkout.Session
) => {
  const dbSession = await mongoose.startSession();
  let invoiceGenerationPayload: IInvoiceGenerationJobData | null = null;
  let cacheInvalidationPayload: {
    shopId: string;
    userId: string;
  } | null = null;

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

    const deal = await DealModel.findOne({ _id: promotion.deal }).session(
      dbSession
    );
    if (!deal) {
      throw new AppError(StatusCodes.NOT_FOUND, `deal not found`, LoggerModule.PAYMENT);
    }

    if (
      deal.isBanned === true ||
      deal.get('deal_status') === 'BANNED'
    ) {
      payment.payment_status = PaymentStatus.CANCELED;
      promotion.status = PromotionStatus.CANCELED;

      await Promise.all([
        payment.save({ session: dbSession }),
        promotion.save({ session: dbSession }),
      ]);

      return;
    }

    /* ---- UPDATE PAYMENT ---- */
    payment.payment_status = PaymentStatus.PAID;
    const paymentIntentId = getStripeObjectId(session.payment_intent);
    if (paymentIntentId) {
      payment.payment_intent_id = paymentIntentId;
    }

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
    deal.promotedUntil = endDate;
    deal.isPromoted = true;
    deal.activePromotion = promotion._id;

    await deal.save({ session: dbSession });

    // ADD QUEUE JOB SCHEDULE
    scheduleDealJobs(deal);

    /* ---- VOUCHER DECREMENT (SAFE) ---- */

    if (payment.voucher_applied) {
      await Voucher.updateOne(
        {
          voucher_code: payment.voucher_applied,
          voucher_limit: { $gt: 0 },
        },
        { $inc: { voucher_limit: -1 } },
        { session: dbSession }
      );
    }

    // ------------------------------ INVOICE GENERATION PREPARATION ------------------------------
    const [shop, vendor, category, location] = await Promise.all([
      Shop.findById(deal.shop).session(dbSession).lean(),
      User.findById(payment.user)
        .session(dbSession)
        .select('user_name email')
        .lean(),
      Category.findById(deal.category)
        .session(dbSession)
        .select('category_name')
        .lean(),
      Location.findOne({ shop: deal.shop })
        .session(dbSession)
        .select('address zip_code')
        .lean(),
    ]);

    const currency = (payment.currency || 'USD').toUpperCase();
    const paidAt = session.created ? new Date(session.created * 1000) : now;
    const formattedPaymentDate = new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(paidAt);
    let moneyFormatter: Intl.NumberFormat | undefined;

    try {
      moneyFormatter = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
      });
    } catch {
      moneyFormatter = undefined;
    }

    const paidAmount = Number(payment.amount || 0);
    const formattedAmount = moneyFormatter
      ? moneyFormatter.format(paidAmount)
      : `${currency} ${paidAmount.toFixed(2)}`;
    const formattedZeroAmount = moneyFormatter
      ? moneyFormatter.format(0)
      : `${currency} 0.00`;
    const businessPhone =
      [shop?.business_phone?.country_code, shop?.business_phone?.phone_number]
        .filter(Boolean)
        .join(' ') || 'N/A';

      const address = `${location?.address}, ${location?.address?.zip_code}, ${location?.address?.city}, ${location?.address?.country}`;

    const businessAddress =
      [address, location?.address?.zip_code].filter(Boolean).join(', ') || 'N/A';

    const paymentMethod = session.payment_method_types?.length
      ? `Stripe (${session.payment_method_types.join(', ')})`
      : 'Stripe';
      
    const invoiceData: InvoiceData = {
      invoiceNumber: `#INV-${payment.transaction_id}`,
      status: 'PAID',
      issueDate: formattedPaymentDate,
      dueDate: formattedPaymentDate,
      paymentDate: formattedPaymentDate,
      platform: {
        legalName: env.EMAIL_FROM_NAME || 'Yepp Ads',
        supportEmail: env.EMAIL_FROM,
        website: env.FRONTEND_URL,
        taxId: 'N/A',
      },
      billedTo: {
        businessName: shop?.business_name || vendor?.user_name || 'Vendor',
        contactName: vendor?.user_name || 'Vendor',
        email: shop?.business_email || vendor?.email || 'N/A',
        phone: businessPhone,
        address: businessAddress,
      },
      promotedService: {
        name: deal.title,
        category: category?.category_name || 'N/A',
      },
      totals: {
        subtotal: formattedAmount,
        taxLabel: 'Tax',
        tax: formattedZeroAmount,
        total: formattedAmount,
      },
      payment: {
        method: paymentMethod,
        transactionId: payment.payment_intent_id || payment.transaction_id,
        paidOn: formattedPaymentDate,
        status: 'Confirmed',
      },
      note: {
        text: 'Thank you for promoting your ads on Yepp Ads. For performance reports and analytics, visit your vendor dashboard at',
        dashboardUrl: `${env.FRONTEND_URL}/shop-overview`,
      },
    };

    const emailTo = shop?.business_email || vendor?.email;

    invoiceGenerationPayload = {
      paymentId: payment._id.toString(),
      invoice: invoiceData,
      ...(emailTo
        ? {
            email: {
              to: emailTo,
              subject: `Payment confirmed - ${invoiceData.invoiceNumber}`,
            },
          }
        : {}),
    };
    cacheInvalidationPayload = {
      shopId: deal.shop.toString(),
      userId: payment.user.toString(),
    };
  });

  if (invoiceGenerationPayload && cacheInvalidationPayload) {
    const invoicePayload = invoiceGenerationPayload;
    const { shopId, userId } = cacheInvalidationPayload;

    // REMOVE REDIS CACHE KEY
    setImmediate(async () => {
      try {
        await redisClient.del(`shop:${shopId}`);
        await redisClient.del(`dashboard_analytics_total`); // dashboard analytics total cache invalidate
        await redisClient.del(`last_one_year_revenue_trend`); // last one year revenue trend cached invalidate (dashboard api)
        await invalidateAllMachineryCache('machinery:*'); // vendor stats cache invalidate (dashboard)
        await invalidateAllMachineryCache('location_deals:*'); // location mode deal search cache invalidate
        await invalidateAllMachineryCache('all_vendors_dashboard:*'); // vendor stats cache invalidate (dashboard)
        await invalidateAllMachineryCache('recent_deals:*'); // recent deals list (dashboard)
        await invalidateAllMachineryCache('latest_transaction:*'); // latest transaction list cache invalidate (dashboard)
        await invalidateAllMachineryCache(`my_deals-userId:${userId}:*`); // get my deals cache invalidate (deal.service.ts)
      } catch {
        //
      }

      await addInvoiceGenerationJob(invoicePayload);
    });
  }
};


// STRIPE FAIL PAYMENT AND PROMOTION HANDLER
export const failPaymentAndPromotion = async (
  paymentFilter: PaymentFailureFilter,
  paymentUpdate: Partial<{ payment_intent_id: string }> = {}
) => {
  const payment = await PaymentModel.findOneAndUpdate(
    paymentFilter,
    { payment_status: PaymentStatus.FAILED, ...paymentUpdate },
    { new: true }
  ).select('promotion');

  if (!payment?.promotion) return payment;

  await Promotion.updateOne(
    { _id: payment.promotion },
    { status: PromotionStatus.CANCELED }
  );

  return payment;
};

// STRIPE PAYMENT FAIL HANDLER
export const paymentFailedHandler = async (
  session: Stripe.Checkout.Session
) => {
  await failPaymentAndPromotion({ stripe_session_id: session.id });
};

// STRIPE PAYMENT INTENT FAIL HANDLER
export const paymentIntentFailedHandler = async (
  paymentIntent: Stripe.PaymentIntent
) => {
  const payment = await failPaymentAndPromotion({
    payment_intent_id: paymentIntent.id,
  });

  if (payment || !paymentIntent.metadata?.payment) return;

  await failPaymentAndPromotion(
    { _id: paymentIntent.metadata.payment },
    { payment_intent_id: paymentIntent.id }
  );
};
