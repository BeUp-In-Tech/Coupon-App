/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextFunction, Request, Response } from 'express';
import { logger } from './logger/logger.config';
import { authLogger, dashboardLogger, dealLogger, emailLogger, locationLogger, LoggerModule, notificationLogger, paymentLogger, shopLogger, socketLogger, uploadLogger, userLogger, workerLogger } from './logger/logger.child';


type AsyncHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<void>;


const getLoggerModule = (key: string) => {
  switch (key) {
    case LoggerModule.AUTH:
      return authLogger;
    case LoggerModule.USER:
      return userLogger;
    case LoggerModule.DEAL:
      return dealLogger;
    case LoggerModule.LOCATION:
      return locationLogger;
    case LoggerModule.NOTIFICATION:
      return notificationLogger;
    case LoggerModule.SHOP:
      return shopLogger;
    case LoggerModule.PAYMENT:
      return paymentLogger;
    case LoggerModule.UPLOAD:
      return uploadLogger;
    case LoggerModule.EMAIL:
      return emailLogger;
    case LoggerModule.WORKER:
      return workerLogger;
    case LoggerModule.SOCKET:
      return socketLogger;
    case LoggerModule.ADMIN:
      return dashboardLogger;
    default:
      return logger;
  }
};

export const CatchAsync =
  (fn: AsyncHandler) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await fn(req, res, next);
    } catch (error: any) {
      const loggerModule = getLoggerModule(error?.module);
      loggerModule.error({
        id: req.id,
        userId: (req?.user as any)?.userId || null,
        method: req.method,
        url: req.url,
        stack: error.stack,
      }, error.message);
  
      next(error);
    }
  };
