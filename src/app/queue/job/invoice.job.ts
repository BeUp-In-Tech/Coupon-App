/* eslint-disable @typescript-eslint/no-explicit-any */
import { InvoiceData } from '../../utils/invoice/invoicePdf.utility';
import { workerLogger } from '../../utils/logger/logger.child';
import { invoiceGenerationQueue } from '../index.queue';

const queuedLogger = workerLogger.child({
  queue: 'invoiceGenerationQueue',
  job: 'addInvoiceGenerationJob',
});

export enum InvoiceJobName {
  GENERATE_VENDOR_INVOICE = 'GENERATE_VENDOR_INVOICE',
}

export interface IInvoiceGenerationJobData {
  paymentId: string;
  invoice: InvoiceData;
  email?: {
    to: string;
    subject?: string;
  };
}

export const addInvoiceGenerationJob = async (
  payload: IInvoiceGenerationJobData
) => {
  try {
    const job = await invoiceGenerationQueue.add(
      InvoiceJobName.GENERATE_VENDOR_INVOICE,
      payload,
      {
        jobId: `${payload.paymentId}-${InvoiceJobName.GENERATE_VENDOR_INVOICE}`,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: true,
        removeOnFail: 100,
      }
    );

    queuedLogger.info({ jobId: job.id, paymentId: payload.paymentId }, 'Invoice generation job registered');
    return job;
  } catch (error: any) {
    queuedLogger.error({ error, paymentId: payload.paymentId }, 'Invoice generation queue add error');
    return null;
  }
};
