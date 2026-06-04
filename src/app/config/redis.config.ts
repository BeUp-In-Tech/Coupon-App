/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-explicit-any */
// /* eslint-disable @typescript-eslint/no-explicit-any */
// /* eslint-disable no-console */
import { createClient } from 'redis';
import env from './env';

export const redisClient = createClient({
  socket: {
    host: env.REDIS_HOST,
    port: Number(env.REDIS_PORT)
  },
});

redisClient.on('error', (error: any) => console.log('Redis client error', error));

let redisConnectionPromise: Promise<void> | null = null;

export const connectRedis = async () => {
  if (redisClient.isReady) {
    return;
  }

  if (!redisConnectionPromise && !redisClient.isOpen) {
    redisConnectionPromise = redisClient
      .connect()
      .then(() => {
        console.log('Redis connected');
      })
      .finally(() => {
        redisConnectionPromise = null;
      });
  }

  if (redisConnectionPromise) {
    await redisConnectionPromise;
  }
};
