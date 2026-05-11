/* eslint-disable no-console */
import mongoose from 'mongoose';
import env from '../config/env';
import { notificationWorker } from './worker/notification.worker';
import { emailSendWorker } from './worker/email_send.worker';
import { dealHandleWorker } from './worker/deal.worker';
import { imageDeleteWorker } from './worker/cloudinaryImageDeletion';
import { bulkMailSender } from './worker/multiple_emails.worker';
import { invoiceGenerationWorker } from './worker/invoice.worker';


// RUN ALL WORKER JOB HERE WITH DATABASE CONNECTION
const connectQueueDB = async () => {
  try {
    await mongoose.connect(env.MONGO_URI as string);
    console.log('Connected to queue database');


    // DEAL EXPIRATION AND REMINDER HANDLING
    dealHandleWorker();

    // NOTIFICATION SEND WORKER
    notificationWorker();

    // EMAIL SEND WORKER
    emailSendWorker();

    // BULL MAIL SENDER
    bulkMailSender();
    
    // DEAL HANDLE WORKER
    dealHandleWorker();

    // IMAGES HANDLE WORKER
    imageDeleteWorker();

    // INVOICE GENERATION WORKER
    invoiceGenerationWorker();

  } catch (error) {
    console.log('Error connecting to Redis:', error);
  }
};

connectQueueDB();
