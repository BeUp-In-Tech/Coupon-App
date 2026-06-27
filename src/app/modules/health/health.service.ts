import mongoose from 'mongoose';
import os from 'os';
import { statfs } from 'fs/promises';
import env from '../../config/env';
import { redisClient } from '../../config/redis.config';

const mongoStateMap: Record<number, string> = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

const bytesToMb = (bytes: number) => Math.round((bytes / 1024 / 1024) * 100) / 100;
const percentage = (value: number) => Math.round(value * 10000) / 100;

const getMemoryUsage = () => {
  const totalBytes = os.totalmem();
  const freeBytes = os.freemem();
  const usedBytes = totalBytes - freeBytes;
  const processMemory = process.memoryUsage();

  return {
    system: {
      totalMb: bytesToMb(totalBytes),
      usedMb: bytesToMb(usedBytes),
      freeMb: bytesToMb(freeBytes),
      usedPercent: percentage(usedBytes / totalBytes),
    },
    process: {
      rssMb: bytesToMb(processMemory.rss),
      heapTotalMb: bytesToMb(processMemory.heapTotal),
      heapUsedMb: bytesToMb(processMemory.heapUsed),
      externalMb: bytesToMb(processMemory.external),
    },
  };
};

const getCpuUsage = () => {
  const loadAverage = os.loadavg();

  return {
    cores: os.cpus().length,
    loadAverage: {
      oneMinute: loadAverage[0],
      fiveMinutes: loadAverage[1],
      fifteenMinutes: loadAverage[2],
    },
  };
};

const getDiskUsage = async () => {
  try {
    const stats = await statfs(process.cwd());
    const totalBytes = stats.blocks * stats.bsize;
    const freeBytes = stats.bavail * stats.bsize;
    const usedBytes = totalBytes - freeBytes;

    return {
      status: 'ok',
      path: 'application_root',
      totalMb: bytesToMb(totalBytes),
      usedMb: bytesToMb(usedBytes),
      freeMb: bytesToMb(freeBytes),
      usedPercent: percentage(usedBytes / totalBytes),
    };
  } catch {
    return {
      status: 'unavailable',
      path: 'application_root',
    };
  }
};

const getSystemHealthService = async () => {
  const databaseStatus =
    mongoStateMap[mongoose.connection.readyState] ?? 'unknown';
  const redisStatus = redisClient.isReady ? 'connected' : 'disconnected';
  const isHealthy = databaseStatus === 'connected' && redisClient.isReady;
  const disk = await getDiskUsage();

  return {
    status: isHealthy ? 'ok' : 'degraded',
    service: env.SERVICE_NAME,
    environment: env.NODE_ENV,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    system: {
      cpu: getCpuUsage(),
      memory: getMemoryUsage(),
      disk,
    },
    dependencies: {
      database: {
        status: databaseStatus,
      },
      redis: {
        status: redisStatus,
      },
    },
  };
};

export const healthServices = {
  getSystemHealthService,
};
