/* eslint-disable @typescript-eslint/no-explicit-any */
import { Job, Worker } from 'bullmq';
import { sendEmail } from '../../utils/sendMail';
import { connection } from '../index.queue';
import { workerLogger } from '../../utils/logger/logger.child';

const EMAIL_WORKER_CONCURRENCY = 10;
const BULK_EMAIL_SEND_CONCURRENCY = 10;
const queuedLogger = workerLogger.child({
  queue: 'emailSendQueue',
});

const isBulkEmailJob = (job: Job) =>
  job.name === 'send-email-batch' || Array.isArray(job.data?.emails);

const chunkArray = <T>(arr: T[], size: number) => {
  const chunks: T[][] = [];

  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }

  return chunks;
};

const sendBulkEmailBatch = async (data: any) => {
  const { emails, title, message } = data;

  if (!Array.isArray(emails) || !emails.length || !title) {
    throw new Error('Invalid bulk email job payload');
  }

  const emailChunks = chunkArray(emails, BULK_EMAIL_SEND_CONCURRENCY);

  for (const emailChunk of emailChunks) {
    await Promise.all(
      emailChunk.map((email: string) =>
        sendEmail({
          to: email,
          subject: title,
          templateName: 'bulkEmail',
          templateData: {
            message: message || '',
          },
        })
      )
    );
  }

  queuedLogger.info({ emailCount: emails.length }, 'Bulk email batch sent');
};

const sendSingleEmail = async (data: any) => {
  if (!data?.to || !data?.subject || !data?.templateName) {
    throw new Error('Invalid single email job payload');
  }

  await sendEmail(data);
  queuedLogger.info({ to: data.to, subject: data.subject }, 'Email sent');
};

export const emailSendWorker = async () => {
  const worker = new Worker(
    'emailSendQueue',
    async (job) => {
      const jobLogger = queuedLogger.child({
        jobId: job.id,
        jobName: job.name,
        attemptsMade: job.attemptsMade,
      });

      try {
        if (isBulkEmailJob(job)) {
          await sendBulkEmailBatch(job.data);
          return;
        }

        await sendSingleEmail(job.data);
      } catch (error: any) {
        jobLogger.error({ error }, 'Email sending error from bullmq');
        throw error;
      }
    },
    { connection, concurrency: EMAIL_WORKER_CONCURRENCY }
  );

  // LISTEN COMPLETED AND FAILED EVENT
  worker.on('completed', (job) => {
    queuedLogger.info({ jobId: job.id, jobName: job.name }, 'Job completed');
  });

  worker.on('failed', (job, err) => {
    queuedLogger.error({ jobId: job?.id, jobName: job?.name, err }, 'Job failed');
  });
};
