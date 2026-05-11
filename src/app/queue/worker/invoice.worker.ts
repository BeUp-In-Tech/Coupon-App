/* eslint-disable no-console */
import { Worker } from 'bullmq';
import { uploadBufferToCloudinary } from '../../config/cloudinary.config';
import { PaymentModel } from '../../modules/payment/payment.model';
import { generateInvoicePdf } from '../../utils/invoice/invoicePdf.utility';
import { connection, mailQueue } from '../index.queue';
import {
  IInvoiceGenerationJobData,
  InvoiceJobName,
} from '../job/invoice.job';

const sanitizeFileName = (value: string) => value.replace(/[^a-z0-9._-]/gi, '');

const addPaymentConfirmationMailJob = async (
  paymentId: string,
  invoiceUrl: string,
  jobData: IInvoiceGenerationJobData,
  pdfBuffer?: Buffer
) => {
  if (!jobData.email?.to) {
    return;
  }

  const { invoice } = jobData;
  const fileName = `invoice-${sanitizeFileName(invoice.invoiceNumber)}.pdf`;

  await mailQueue.add(
    'sendEmail',
    {
      to: jobData.email.to,
      subject: jobData.email.subject || `Payment confirmed - ${invoice.invoiceNumber}`,
      templateName: 'payment_confirmation_invoice',
      templateData: {
        vendorName: invoice.billedTo.contactName,
        invoiceNumber: invoice.invoiceNumber,
        dealTitle: invoice.promotedService.name,
        amount: invoice.totals.total,
        paidOn: invoice.payment.paidOn,
        paymentMethod: invoice.payment.method,
        transactionId: invoice.payment.transactionId,
        invoiceUrl,
        hasAttachment: Boolean(pdfBuffer),
      },
      ...(pdfBuffer
        ? {
            attachments: [
              {
                filename: fileName,
                content: pdfBuffer.toString('base64'),
                contentType: 'application/pdf',
                encoding: 'base64',
              },
            ],
          }
        : {}),
    },
    {
      jobId: `PAYMENT_CONFIRMATION-${paymentId}`,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: true,
      removeOnFail: 100,
    }
  );
};

export const invoiceGenerationWorker = () => {
  const worker = new Worker<IInvoiceGenerationJobData>(
    'invoiceGenerationQueue',
    async (job) => {
      if (job.name !== InvoiceJobName.GENERATE_VENDOR_INVOICE) {
        return;
      }

      const { paymentId, invoice } = job.data;

      if (!paymentId || !invoice) {
        throw new Error('Invalid invoice generation payload');
      }

      const existingPayment = await PaymentModel.findById(paymentId)
        .select('invoice_url')
        .lean();

      if (existingPayment?.invoice_url) {
        console.log('Invoice already exists for payment:', paymentId);
        const pdfBuffer = await generateInvoicePdf(invoice);
        await addPaymentConfirmationMailJob(
          paymentId,
          existingPayment.invoice_url,
          job.data,
          pdfBuffer
        );
        return existingPayment.invoice_url;
      }

      const pdfBuffer = await generateInvoicePdf(invoice);
      const fileName = `invoice-${sanitizeFileName(invoice.invoiceNumber)}`;
      const uploadedInvoice = await uploadBufferToCloudinary(
        pdfBuffer,
        fileName
      );

      const invoiceUrl = uploadedInvoice?.secure_url || uploadedInvoice?.url;

      if (!invoiceUrl) {
        throw new Error('Invoice upload failed');
      }

      await PaymentModel.updateOne(
        { _id: paymentId },
        { $set: { invoice_url: invoiceUrl } }
      );

      await addPaymentConfirmationMailJob(
        paymentId,
        invoiceUrl,
        job.data,
        pdfBuffer
      );

      console.log('Invoice generated for payment:', paymentId);
      return invoiceUrl;
    },
    { connection, concurrency: 2 }
  );

  worker.on('completed', (job) => {
    console.log('Invoice Job completed:', job.id);
  });

  worker.on('failed', (job, err) => {
    console.error('Invoice Job failed:', job?.id, err);
  });
};
