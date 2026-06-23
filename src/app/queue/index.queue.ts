import { Queue } from 'bullmq';
import { createClient } from 'redis';
import env from '../config/env';

// Keep BullMQ's connection lifecycle separate from the application cache/session client.
// The redis client from 'redis' (node-redis v4) has a different type than BullMQ expects
// (which commonly targets ioredis). Cast to `any` to satisfy BullMQ's ConnectionOptions type.
export const connection = createClient({
  socket: {
    host: env.REDIS_HOST,
    port: Number(env.REDIS_PORT),
  },
// eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as any;

// QUEUE LIST
export const mailQueue = new Queue('emailSendQueue', { connection });
export const notificationQueue = new Queue('notificationQueue', { connection });
export const dealHandleQueue = new Queue('dealHandleQueue', { connection });
export const imageDeleteQueue = new Queue('imageDeleteQueue', { connection });
export const invoiceGenerationQueue = new Queue('invoiceGenerationQueue', {
  connection,
});
export const vendorExportQueue = new Queue('vendorExportQueue', { connection });
