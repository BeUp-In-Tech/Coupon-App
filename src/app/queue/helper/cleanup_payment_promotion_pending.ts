/* eslint-disable @typescript-eslint/no-explicit-any */
import { PaymentStatus } from '../../modules/payment/payment.interface';
import { PaymentModel } from '../../modules/payment/payment.model';
import { Promotion } from '../../modules/promotion/promotion.model';
import { workerLogger } from '../../utils/logger/logger.child';

const queuedLogger = workerLogger.child({
  queue: 'dealHandleQueue',
  helper: 'cleanupPaymentPromotionPending',
});

interface Id {
  promotionId: string;
  paymentId: string;
}

const removePaymentPendingOver15Min = async ({
  promotionId,
  paymentId,
}: Id) => {
  try {
    queuedLogger.info({ promotionId, paymentId }, 'Running cleanup job');

    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

    const deletedPayments = await PaymentModel.deleteOne({
      payment_status: PaymentStatus.PENDING,
      promotion: promotionId,
      createdAt: { $lt: fifteenMinutesAgo },
    });

    const deletedPromotions = await Promotion.deleteOne({
      _id: promotionId,
      payment: paymentId,
      status: 'PENDING',
      createdAt: { $lt: fifteenMinutesAgo },
    });

    queuedLogger.info(
      {
        deletedPayments: deletedPayments.deletedCount,
        deletedPromotions: deletedPromotions.deletedCount,
      },
      'Pending payment promotion cleanup completed'
    );
  } catch (error: any) {
    queuedLogger.error({ error, promotionId, paymentId }, 'Pending cleanup queue error');
  }
};

export default removePaymentPendingOver15Min;
