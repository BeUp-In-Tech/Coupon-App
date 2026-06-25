import { Queue } from 'bullmq';
import env from '../config/env';

// Keep BullMQ's connection lifecycle separate from the application cache/session client.
// BullMQ creates/manages its own ioredis connections from these options.
export const connection = {
  host: env.REDIS_HOST,
  port: Number(env.REDIS_PORT),
};

// QUEUE LIST
export const mailQueue = new Queue('emailSendQueue', { connection });
export const notificationQueue = new Queue('notificationQueue', { connection });
export const dealHandleQueue = new Queue('dealHandleQueue', { connection });
export const imageDeleteQueue = new Queue('imageDeleteQueue', { connection });
export const invoiceGenerationQueue = new Queue('invoiceGenerationQueue', {
  connection,
});
export const vendorExportQueue = new Queue('vendorExportQueue', { connection });
