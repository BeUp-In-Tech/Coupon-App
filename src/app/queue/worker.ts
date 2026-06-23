import mongoose from 'mongoose';
import env from '../config/env';
import { notificationWorker } from './worker/notification.worker';
import { emailSendWorker } from './worker/email_send.worker';
import { dealHandleWorker } from './worker/deal.worker';
import { imageDeleteWorker } from './worker/cloudinaryImageDeletion.worker';
import { invoiceGenerationWorker } from './worker/invoice.worker';
import { vendorExportWorker } from './worker/vendorExport.worker';
import {
  dealHandleQueue,
  imageDeleteQueue,
  invoiceGenerationQueue,
  mailQueue,
  notificationQueue,
  vendorExportQueue,
} from './index.queue';
import { workerLogger } from '../utils/logger/logger.child';

const queuedLogger = workerLogger.child({
  queue: 'workerBootstrap',
});

// RUN ALL WORKER JOB HERE WITH DATABASE CONNECTION
const connectQueueDB = async () => {
  try {
    await mongoose.connect(env.MONGO_URI as string);
    queuedLogger.info('Connected to queue database');

    // SET GLOBAL CONCURRENCY FIRST
    await Promise.all([
      mailQueue.setGlobalConcurrency(10),
      notificationQueue.setGlobalConcurrency(20),
      dealHandleQueue.setGlobalConcurrency(3),
      imageDeleteQueue.setGlobalConcurrency(5),
      invoiceGenerationQueue.setGlobalConcurrency(2),
      vendorExportQueue.setGlobalConcurrency(1),
    ]);

    queuedLogger.info('Global concurrency configured');

    // DEAL EXPIRATION AND REMINDER HANDLING
    dealHandleWorker();

    // NOTIFICATION SEND WORKER
    notificationWorker();

    // EMAIL SEND WORKER
    emailSendWorker();

    // IMAGES HANDLE WORKER
    imageDeleteWorker();

    // INVOICE GENERATION WORKER
    invoiceGenerationWorker();

    // VENDOR XLSX EXPORT WORKER
    vendorExportWorker();
  } catch (error) {
    queuedLogger.error({ error }, 'Error connecting to queue database');
  }
};

connectQueueDB();
