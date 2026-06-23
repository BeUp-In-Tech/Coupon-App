import env from '../../config/env';
import pino from 'pino';

const isDevelopment = env.NODE_ENV === 'development';

export const logger = pino({
  level: env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    service: env.SERVICE_NAME || 'backend-api',
    env: env.NODE_ENV || 'development',
  },

  redact: {
    paths: [
      'password',
      'confirmPassword',
      'token',
      'accessToken',
      'refreshToken',
      'authorization',
      'headers.authorization',
      'req.headers.authorization',
      'body.password',
      'body.confirmPassword',
      'body.token',
      'body.accessToken',
      'body.refreshToken',
      'payment.card',
      'stripe.secret',
    ],
    censor: '[REDACTED]',
  },

  transport: isDevelopment ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
    },
  } : {
    target: 'pino/file',
  }
});
