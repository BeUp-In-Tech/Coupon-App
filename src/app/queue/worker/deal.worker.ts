import { Worker } from 'bullmq';
import { connection } from '../index.queue'
import { dealExpireHandle } from '../helper/expiredDeal.update';
import { oneDayReminder, oneHourReminder } from '../helper/reminder.deal';
import removePaymentPendingOver15Min from '../helper/cleanup_payment_promotion_pending';
import { workerLogger } from '../../utils/logger/logger.child';

const queuedLogger = workerLogger.child({
  queue: 'dealHandleQueue',
});


export enum JobName {
  DEAL_REMINDER_DAY = 'DEAL_REMINDER_DAY',
  DEAL_REMINDER_HOUR = 'DEAL_REMINDER_HOUR',
  DEAL_EXPIRE = 'DEAL_EXPIRE',
  PAYMENT_PENDING_CLEANUP_OVER_15MIN = 'PAYMENT_PENDING_CLEANUP_OVER_15MIN'
}


// DEAL HANDLE WORKER

export const dealHandleWorker = () => {
  const worker = new Worker(
    'dealHandleQueue',
    async (job) => {
      const jobLogger = queuedLogger.child({
        jobId: job.id,
        jobName: job.name,
        attemptsMade: job.attemptsMade,
      });

      try {
        switch (job.name) {
            case JobName.DEAL_REMINDER_DAY :
                await oneDayReminder(job.data.dealId);
                break;
            case JobName.DEAL_REMINDER_HOUR :
              await oneHourReminder(job.data.dealId);
                break;
            case JobName.DEAL_EXPIRE :
              await dealExpireHandle(job.data.dealId);
                break;
            case JobName.PAYMENT_PENDING_CLEANUP_OVER_15MIN :
              await removePaymentPendingOver15Min({promotionId: job.data.promotionId, paymentId: 
              job.data.paymentId});
                break;
            default:
                break;
        }
      } catch (error) {
        jobLogger.error({ error }, 'Deal queue handling error from bullmq');
      }
    },
    { connection }
  );

  // LISTEN COMPLETED AND FAILED EVENT
  worker.on('completed', (job) => {
    queuedLogger.info({ jobId: job.id, jobName: job.name }, 'Job completed');
  });

  worker.on('failed', (job, err) => {
    queuedLogger.error({ jobId: job?.id, jobName: job?.name, err }, 'Job failed');
  });
};

