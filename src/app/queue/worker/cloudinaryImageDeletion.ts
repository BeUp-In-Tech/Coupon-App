/* eslint-disable no-console */
import { Worker } from 'bullmq';
import { connection } from '../index.queue';
import { deleteImageFromCLoudinary } from '../../config/cloudinary.config';

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
      try {
        const images = Array.isArray(job.data)
          ? job.data.filter((item) => typeof item === 'string' && item.trim())
          : [];

        if (!images.length) {
          return;
        }

        await strictMultipleImageDelete(images);
        console.log('Queued image deleted');
      } catch (error) {
        console.log('Imaged deletion error from bullmq: ', error);
        throw error;
      }
    },
    { connection }
  );

  // LISTEN COMPLETED AND FAILED EVENT
  worker.on('completed', (job) => {
    console.log('Job completed:', job.id);
  });

  worker.on('failed', (job, err) => {
    console.error('Job failed:', err);
  });
};

