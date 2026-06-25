/* eslint-disable @typescript-eslint/no-explicit-any */
import { imageDeleteQueue } from '../queue/index.queue';
import { uploadLogger } from './logger/logger.child';

const queuedLogger = uploadLogger.child({
  queue: 'imageDeleteQueue',
  job: 'addImageDeleteJob',
});

const DEFAULT_CHUNK_SIZE = 50;
const DEFAULT_ATTEMPTS = 3;

const normalizeImageUrls = (images: string[]) => {
  return [...new Set(images.map((img) => img?.trim()).filter(Boolean))];
};

const chunkArray = (arr: string[], size: number) => {
  const chunks: string[][] = [];

  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }

  return chunks;
};

export interface IImageDeleteJobResult {
  error?: string;
  totalReceived: number;
  totalQueuedImages: number;
  queuedJobs: number;
}
export interface IAddImageDeleteJobOptions {
  throwOnError?: boolean;
}

/**
 * Queue cloudinary image deletion jobs.
 * Input: array of image URLs.
 * Each job payload is string[] and consumed by imageDeleteWorker.
 */
export const addImageDeleteJob = async (
  images: string[],
  options?: IAddImageDeleteJobOptions
): Promise<IImageDeleteJobResult> => {
  const normalizedImages = normalizeImageUrls(images || []);

  if (!normalizedImages.length) {
    return {
      totalReceived: images?.length || 0,
      totalQueuedImages: 0,
      queuedJobs: 0,
    };
  }

  const chunks = chunkArray(normalizedImages, DEFAULT_CHUNK_SIZE);
  const now = Date.now();

  try {
    await imageDeleteQueue.addBulk(
      chunks.map((chunk, index) => ({
        name: 'DELETE_CLOUDINARY_IMAGES',
        data: chunk,
        opts: {
          jobId: `DELETE_CLOUDINARY_IMAGES:${now}:${index}`,
          attempts: DEFAULT_ATTEMPTS,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
          removeOnComplete: true,
          removeOnFail: 200,
        },
      }))
    );

    return {
      totalReceived: images.length,
      totalQueuedImages: normalizedImages.length,
      queuedJobs: chunks.length,
    };
  } catch (error: any) {
    if (options?.throwOnError) {
      throw error;
    }

    queuedLogger.error({ error }, 'Image delete queue add error');
    return {
      totalReceived: images?.length || 0,
      totalQueuedImages: 0,
      queuedJobs: 0,
      error: error?.message || 'QUEUE_ADD_FAILED',
    };
  }
};

