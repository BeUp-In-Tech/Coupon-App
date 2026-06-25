import { promises as fs } from 'fs';
import path from 'path';
import cron from 'node-cron';
import { Worker } from 'bullmq';
import { Shop } from '../../modules/shop/shop.model';
import { workerLogger } from '../../utils/logger/logger.child';
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

const queuedLogger = workerLogger.child({
  queue: 'vendorExportQueue',
});

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
    queuedLogger.error({ error }, 'Initial vendor export cleanup failed')
  );

  // One worker process owns local files, so lightweight process-local cleanup is enough.
  cron.schedule('0 * * * *', () => {
    cleanupExpiredVendorExports().catch((error) =>
      queuedLogger.error({ error }, 'Vendor export cleanup failed')
    );
  });

  const worker = new Worker<IVendorExportJobData, IVendorExportJobResult>(
    'vendorExportQueue',
    async (job) => {
      const jobLogger = queuedLogger.child({
        jobId: job.id,
        jobName: job.name,
        attemptsMade: job.attemptsMade,
      });

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

      jobLogger.info({ rowCount, fileName }, 'Vendor export workbook generated');

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
    queuedLogger.info({ jobId: job.id, jobName: job.name }, 'Job completed');
  });

  worker.on('failed', (job, error) => {
    removePartialExport(job?.id).catch(() => undefined);
    queuedLogger.error({ jobId: job?.id, jobName: job?.name, error }, 'Job failed');
  });
};
