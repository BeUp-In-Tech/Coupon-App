/* eslint-disable @typescript-eslint/no-explicit-any */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import envVars from './app/config/env';
import { connectRedis } from './app/config/redis.config';
import { createAdmin } from './app/utils/seedAdmin';
import app from './app';
import { Server } from 'http';
import { logger } from './app/utils/logger/logger.config';


dotenv.config();

const PORT = envVars.PORT || 3002;

let server: Server

const startServer = async () => {
  try {
    await mongoose.connect(envVars.MONGO_URI);
    logger.info(`Database connected`);

    server = app.listen(PORT, () => {
      logger.info({ PORT }, 'Server is running');;
    });
  } catch (error: any) {
   logger.info(`Server crashed: `, error.message);
  }
};


// BOOM START THE SERVER
(async () => {
  await connectRedis();
  await startServer();
  await createAdmin();
})();







// SIGTERM signal detected and close the server
process.on('SIGTERM', () => {
  logger.info('SIGTERM SIGNAL FOUND and server shutting down...');

  if (server) {
    server.close(() => {
      // server closing
      logger.info('server closed');
      process.exit(1); // exit from server
    });
  } else {
    process.exit(1);
  }
});
// SIGINT signal send
process.on('SIGINT', (error: any) => {
  logger.info(
    `SIGINT SIGNAL FOUND your server might be closed and server shutting down... `, error.message);

  if (server) {
    server.close(() => {
      // server closing
      logger.info('server closed');
      process.exit(1); // exit from server
    });
  } else {
    process.exit(1);
  }
});

// Unhandled rejection error
process.on('unhandledRejection', (error:  any) => {
  logger.info('Unhandled rejection detected and server shutting down...', error.message);

  if (server) {
    server.close(() => {
      // server closing
      logger.info('server closed');
      process.exit(1); // exit from server
    });
  } else {
    process.exit(1);
  }
});

// Unhandled rejection error
process.on('uncaughtException', (error: any) => {
  logger.info('Uncaught exception detected and server shutting down...', error);

  if (server) {
    server.close(() => {
      // server closing
      logger.info('server closed');
      process.exit(1); // exit from server
    });
  } else {
    process.exit(1);
  }
});
