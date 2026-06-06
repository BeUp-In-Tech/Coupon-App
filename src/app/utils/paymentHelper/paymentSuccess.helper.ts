import mongoose from 'mongoose';
import { PaymentModel } from '../../modules/payment/payment.model';
import { PaymentStatus } from '../../modules/payment/payment.interface';
import { Promotion } from '../../modules/promotion/promotion.model';
import { PromotionStatus } from '../../modules/promotion/promotion.interface';
import { Voucher } from '../../modules/voucher/voucher.model';
import Stripe from 'stripe';
import AppError from '../../errorHelpers/AppError';
import { StatusCodes } from 'http-status-codes';
import { DealModel } from '../../modules/deal/deal.model';
import { redisClient } from '../../config/redis.config';
import { scheduleDealJobs } from '../../queue/job/deal.job';
import { invalidateAllMachineryCache } from '../deleteCachedData';
import {
  addInvoiceGenerationJob,
  IInvoiceGenerationJobData,
} from '../../queue/job/invoice.job';
import { InvoiceData } from '../invoice/invoicePdf.utility';
import { Shop } from '../../modules/shop/shop.model';
import User from '../../modules/user/user.model';
import { Category } from '../../modules/categories/categories.model';
import { OutletModel } from '../../modules/outlet/outlet.model';
import env from '../../config/env';

const getStripeObjectId = (
  value: string | { id?: string } | null | undefined
) => {
  if (!value) return undefined;
  return typeof value === 'string' ? value : value.id;
};

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
      throw new AppError(StatusCodes.NOT_FOUND, `deal not found`);
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

    // INVOICE GENERATION PREPARATION
    const [shop, vendor, category, outlet] = await Promise.all([
      Shop.findById(deal.shop).session(dbSession).lean(),
      User.findById(payment.user)
        .session(dbSession)
        .select('user_name email')
        .lean(),
      Category.findById(deal.category)
        .session(dbSession)
        .select('category_name')
        .lean(),
      OutletModel.findOne({ shop: deal.shop })
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
    const businessAddress =
      [outlet?.address, outlet?.zip_code].filter(Boolean).join(', ') || 'N/A';
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
        text: 'Thank you for promoting your service on Yepp Ads. For performance reports and analytics, visit your vendor dashboard at',
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
