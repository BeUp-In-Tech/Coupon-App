import { logger } from './logger.config';

export enum LoggerModule {
  AUTH = 'auth',
  USER = 'user',
  DEAL = 'deal',
  LOCATION = 'location',
  NOTIFICATION = 'notification',
  SHOP = 'shop',
  PAYMENT = 'payment',
  UPLOAD = 'upload',
  EMAIL = 'email',
  WORKER = 'worker',
  SOCKET = 'socket',
  ADMIN = 'admin',
}

export const authLogger = logger.child({
  module: LoggerModule.AUTH,
});

export const userLogger = logger.child({
  module: LoggerModule.USER,
});

export const dealLogger = logger.child({
  module: LoggerModule.DEAL,
});

export const locationLogger = logger.child({
  module: LoggerModule.LOCATION,
});

export const notificationLogger = logger.child({
  module: LoggerModule.NOTIFICATION,
});

export const shopLogger = logger.child({
  module: LoggerModule.SHOP,
});

export const paymentLogger = logger.child({
  module: LoggerModule.PAYMENT,
  provider: 'stripe',
});

export const uploadLogger = logger.child({
  module: LoggerModule.UPLOAD,
  provider: 'cloudinary',
});

export const emailLogger = logger.child({
  module: LoggerModule.EMAIL,
});

export const workerLogger = logger.child({
  module: LoggerModule.WORKER,
});

export const socketLogger = logger.child({
  module: LoggerModule.SOCKET,
});

export const dashboardLogger = logger.child({
  module: LoggerModule.ADMIN,
});
