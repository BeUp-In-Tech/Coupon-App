import { vendorExportQueue } from '../index.queue';

// Names let one queue safely support additional export job types later.
export enum VendorExportJobName {
  GENERATE_VENDOR_EXPORT = 'GENERATE_VENDOR_EXPORT',
}

// Store the requesting admin so status and download endpoints can enforce ownership.
export interface IVendorExportJobData {
  requestedBy: string;
}

// Worker output is persisted by BullMQ and consumed by status/download APIs.
export interface IVendorExportJobResult {
  filePath: string;
  fileName: string;
  rowCount: number;
  expiresAt: string;
}

// Queue a retryable export while retaining its metadata for the download window.
export const addVendorExportJob = (requestedBy: string) =>
  vendorExportQueue.add(
    VendorExportJobName.GENERATE_VENDOR_EXPORT,
    { requestedBy },
    {
      attempts: 2,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: { age: 60 * 60, count: 100 },
      removeOnFail: { age: 24 * 60 * 60, count: 100 },
    }
  );
