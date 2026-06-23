import { Worker } from 'bullmq';
import { connection } from '../index.queue';
import { notifyUser } from '../../utils/notification/push.notification';
import { workerLogger } from '../../utils/logger/logger.child';

const queuedLogger = workerLogger.child({
  queue: 'notificationQueue',
});

// NOTIFICATION SEND WORKER

export const notificationWorker = () => {
  const worker = new Worker(
    'notificationQueue',
    async (job) => {
      const jobLogger = queuedLogger.child({
        jobId: job.id,
        jobName: job.name,
        attemptsMade: job.attemptsMade,
      });

      try {
        const result = await notifyUser(job.data);
        jobLogger.info(
          result.pushed
            ? 'Queued notification sent'
            : `Queued notification saved without push: ${result.reason || result.pushError || 'NO_PUSH'}`
        );
      } catch (error) {
        jobLogger.error({ error }, 'Notification sending error from bullmq');
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

