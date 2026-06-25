import { Worker } from 'bullmq';
import { connection } from '../index.queue';
import { deleteImageFromCLoudinary } from '../../config/cloudinary.config';
import { workerLogger } from '../../utils/logger/logger.child';


const queuedLogger = workerLogger.child({
  queue: 'imageDeleteQueue'
})


const strictMultipleImageDelete = async (images: string[]) => {
  const settled = await Promise.allSettled(
    images.map((image) => deleteImageFromCLoudinary(image))
  );

  const failed = settled.filter((result) => result.status === 'rejected');
  if (failed.length) {
    throw new Error(`Cloudinary deletion failed for ${failed.length} image(s)`);
  }
};

// IMAGE DELETE WORKER HANDLER
export const imageDeleteWorker = () => {
  const worker = new Worker(
    'imageDeleteQueue',
    async (job) => {

      const jobLogger = queuedLogger.child({
        jobId: job.id,
        jobName: job.name,
        attemptsMade: job.attemptsMade
      })

      try {
        const images = Array.isArray(job.data)
          ? job.data.filter((item) => typeof item === 'string' && item.trim())
          : [];

        if (!images.length) {
          return;
        }

        await strictMultipleImageDelete(images);
        jobLogger.info('Queued image deleted');
      } catch (error) {
        jobLogger.error({error}, 'Imaged deletion error from bullmq');
        throw error;
      }
    },
    { connection }
  );

  // LISTEN COMPLETED AND FAILED EVENT
  worker.on('completed', (job) => {
    queuedLogger.info({ jobId: job.id, jobName: job.name}, 'Job completed');
  });

  worker.on('failed', (job, err) => {
    queuedLogger.error({err}, 'Job failed');
  });
};

