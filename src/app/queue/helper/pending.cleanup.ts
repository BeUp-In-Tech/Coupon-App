/* eslint-disable @typescript-eslint/no-explicit-any */
import { PaymentModel } from '../../modules/payment/payment.model';
import { Promotion } from '../../modules/promotion/promotion.model';
import { workerLogger } from '../../utils/logger/logger.child';

const queuedLogger = workerLogger.child({
  queue: 'dealHandleQueue',
  helper: 'pendingCleanUp',
});

export const pendingCleanUp = async () => {
  try {
    queuedLogger.info('Running cleanup job');
    const fifteenMinutesAgo = new Date(Date.now() - 10 * 1000);
    //   const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

    const deletedPayments = await PaymentModel.deleteMany({
      payment_status: 'PENDING',
      createdAt: { $lt: fifteenMinutesAgo },
    });

    const deletedPromotions = await Promotion.deleteMany({
      status: 'PENDING',
      createdAt: { $lt: fifteenMinutesAgo },
    });

    queuedLogger.info(
      {
        deletedPayments: deletedPayments.deletedCount,
        deletedPromotions: deletedPromotions.deletedCount,
      },
      'Pending cleanup completed'
    );
  } catch (error: any) {
    queuedLogger.error({ error }, 'Pending cleanup queue error');
  }
};
