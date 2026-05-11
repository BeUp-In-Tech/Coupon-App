import { Queue } from 'bullmq';
import IORedis from 'ioredis';

export const connection = new IORedis({
  host: '127.0.0.1',
  port: 6379,
  maxRetriesPerRequest: null,
});


// QUEUE LIST
export const mailQueue = new Queue('emailSendQueue', { connection });
export const notificationQueue = new Queue('notificationQueue', { connection });
export const dealHandleQueue = new Queue('dealHandleQueue', { connection });
export const imageDeleteQueue = new Queue('imageDeleteQueue', { connection });
export const invoiceGenerationQueue = new Queue('invoiceGenerationQueue', {
  connection,
});
