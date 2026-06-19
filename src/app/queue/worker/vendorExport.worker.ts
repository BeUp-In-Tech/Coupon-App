/* eslint-disable no-console */
import { promises as fs } from 'fs';
import path from 'path';
import cron from 'node-cron';
import { Worker } from 'bullmq';
import { Shop } from '../../modules/shop/shop.model';
import {
  cleanupExpiredVendorExports,
  generateVendorExportWorkbook,
  VENDOR_EXPORT_DIRECTORY,
  VENDOR_EXPORT_TTL_MS,
} from '../../utils/export/vendorExportWorkbook.utility';
import { connection } from '../index.queue';
import {
  IVendorExportJobData,
  IVendorExportJobResult,
  VendorExportJobName,
} from '../job/vendorExport.job';

// Retries must never leave a corrupted or incomplete workbook behind.
const removePartialExport = async (jobId: string | undefined) => {
  if (!jobId) return;
  const filePath = path.join(VENDOR_EXPORT_DIRECTORY, `vendors-${jobId}.xlsx`);
  await fs.rm(filePath, { force: true }).catch(() => undefined);
};

// Register export processing and local temporary-file maintenance.
export const vendorExportWorker = () => {
  // Clean files missed while the worker was stopped before accepting new work.
  cleanupExpiredVendorExports().catch((error) =>
    console.error('Initial vendor export cleanup failed:', error)
  );

  // One worker process owns local files, so lightweight process-local cleanup is enough.
  cron.schedule('0 * * * *', () => {
    cleanupExpiredVendorExports().catch((error) =>
      console.error('Vendor export cleanup failed:', error)
    );
  });

  const worker = new Worker<IVendorExportJobData, IVendorExportJobResult>(
    'vendorExportQueue',
    async (job) => {
      if (job.name !== VendorExportJobName.GENERATE_VENDOR_EXPORT) {
        throw new Error(`Unsupported vendor export job: ${job.name}`);
      }

      if (!job.data.requestedBy) {
        throw new Error('Vendor export requester is missing');
      }

      const fileName = `vendors-${job.id}.xlsx`;
      const filePath = path.join(VENDOR_EXPORT_DIRECTORY, fileName);
      // A retry reuses the job ID, so remove any stale attempt before writing.
      await fs.rm(filePath, { force: true });

      const totalVendors = await Shop.countDocuments();
      const rowCount = await generateVendorExportWorkbook({
        filePath,
        totalVendors,
        // Persist batch progress in Redis for the polling status endpoint.
        onProgress: (progress) => job.updateProgress(progress),
      });

      // Returning metadata makes it available through job.returnvalue.
      return {
        filePath,
        fileName,
        rowCount,
        expiresAt: new Date(Date.now() + VENDOR_EXPORT_TTL_MS).toISOString(),
      };
    },
    // Serialize large exports to protect database, CPU, disk, and memory capacity.
    { connection, concurrency: 1 }
  );

  worker.on('completed', (job) => {
    console.log('Vendor export completed:', job.id);
  });

  worker.on('failed', (job, error) => {
    removePartialExport(job?.id).catch(() => undefined);
    console.error('Vendor export failed:', job?.id, error);
  });
};
