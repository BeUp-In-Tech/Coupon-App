/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { InvoiceData } from '../../utils/invoice/invoicePdf.utility';
import { invoiceGenerationQueue } from '../index.queue';

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

    console.log('Invoice generation job registered:', job.id);
    return job;
  } catch (error: any) {
    console.log('Invoice generation queue add error:', error?.message || error);
    return null;
  }
};
