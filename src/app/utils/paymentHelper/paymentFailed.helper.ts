import Stripe from "stripe";
import { PaymentModel } from "../../modules/payment/payment.model";
import { PaymentStatus } from "../../modules/payment/payment.interface";
import { Promotion } from "../../modules/promotion/promotion.model";
import { PromotionStatus } from "../../modules/promotion/promotion.interface";


export const paymentFailedHandler = async (session: Stripe.Checkout.Session) => {
    await PaymentModel.updateOne(
        { stripe_session_id: session.id },
        { payment_status: PaymentStatus.FAILED }
      );

      await Promotion.updateOne(
        { stripe_session_id: session.id },
        { status: PromotionStatus.CANCELED }
      );
}