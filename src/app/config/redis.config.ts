/* eslint-disable @typescript-eslint/no-explicit-any */
// /* eslint-disable @typescript-eslint/no-explicit-any */
// /* eslint-disable no-console */
import { createClient } from 'redis';
import env from './env';
import { logger } from '../utils/logger/logger.config';

export const redisClient = createClient({
  socket: {
    host: env.REDIS_HOST,
    port: Number(env.REDIS_PORT)
  },
});

redisClient.on('error', (error: any) => logger.error({error}, 'Redis client error'));

let redisConnectionPromise: Promise<void> | null = null;

export const connectRedis = async () => {
  if (redisClient.isReady) {
    return;
  }

  if (!redisConnectionPromise && !redisClient.isOpen) {
    redisConnectionPromise = redisClient
      .connect()
      .then(() => {
        logger.info('Redis connected');
      })
      .finally(() => {
        redisConnectionPromise = null;
      });
  }

  if (redisConnectionPromise) {
    await redisConnectionPromise;
  }
};
