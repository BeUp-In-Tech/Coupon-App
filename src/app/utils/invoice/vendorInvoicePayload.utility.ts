/* eslint-disable @typescript-eslint/no-explicit-any */
import { ClientSession } from 'mongoose';
import env from '../../config/env';
import { Category } from '../../modules/categories/categories.model';
import { OutletModel } from '../../modules/outlet/outlet.model';
import { Shop } from '../../modules/shop/shop.model';
import User from '../../modules/user/user.model';
import type { IInvoiceGenerationJobData } from '../../queue/job/invoice.job';
import { InvoiceData } from './invoicePdf.utility';

interface IVendorInvoicePayloadParams {
  payment: any;
  deal: any;
  paidAt: Date;
  paymentMethod: string;
  dbSession?: ClientSession;
}

const formatInvoiceDate = (date: Date) =>
  new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);

const formatMoney = (amount: number, currency: string) => {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
};

export const buildVendorInvoiceGenerationPayload = async ({
  payment,
  deal,
  paidAt,
  paymentMethod,
  dbSession,
}: IVendorInvoicePayloadParams): Promise<IInvoiceGenerationJobData> => {
  const [shop, vendor, category, outlet] = await Promise.all([
    Shop.findById(deal.shop).session(dbSession || null).lean(),
    User.findById(payment.user)
      .session(dbSession || null)
      .select('user_name email')
      .lean(),
    Category.findById(deal.category)
      .session(dbSession || null)
      .select('category_name')
      .lean(),
    OutletModel.findOne({ shop: deal.shop })
      .session(dbSession || null)
      .select('address zip_code')
      .lean(),
  ]);

  const currency = (payment.currency || 'USD').toUpperCase();
  const formattedPaymentDate = formatInvoiceDate(paidAt);
  const paidAmount = Number(payment.amount || 0);
  const formattedAmount = formatMoney(paidAmount, currency);
  const formattedZeroAmount = formatMoney(0, currency);
  const businessPhone =
    [shop?.business_phone?.country_code, shop?.business_phone?.phone_number]
      .filter(Boolean)
      .join(' ') || 'N/A';
  const businessAddress =
    [outlet?.address, outlet?.zip_code].filter(Boolean).join(', ') || 'N/A';

  const invoice: InvoiceData = {
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

  return {
    paymentId: payment._id.toString(),
    invoice,
    ...(emailTo
      ? {
          email: {
            to: emailTo,
            subject: `Payment confirmed - ${invoice.invoiceNumber}`,
          },
        }
      : {}),
  };
};
