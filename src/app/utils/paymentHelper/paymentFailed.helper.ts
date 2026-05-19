import Stripe from 'stripe';
import { PaymentModel } from '../../modules/payment/payment.model';
import { PaymentStatus } from '../../modules/payment/payment.interface';
import { Promotion } from '../../modules/promotion/promotion.model';
import { PromotionStatus } from '../../modules/promotion/promotion.interface';

interface PaymentFailureFilter {
  _id?: string;
  stripe_session_id?: string;
  payment_intent_id?: string;
};

const failPaymentAndPromotion = async (
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

export const paymentFailedHandler = async (
  session: Stripe.Checkout.Session
) => {
  await failPaymentAndPromotion({ stripe_session_id: session.id });
};

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
