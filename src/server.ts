/* eslint-disable no-console */
import { Server } from 'http';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import app from './app';
import envVars from './app/config/env';
import { connectRedis } from './app/config/redis.config';

 
dotenv.config();

let server: Server;

const PORT = envVars.PORT || 3002;

const startServer = async () => {
  try {
    await mongoose.connect(envVars.MONGO_URI);
    console.log(`Database connceted`);

    server = app.listen(PORT, () => {
      console.log(`Server started on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.log(error);
  }
};


// Booom and start the server
(async () => {
  await connectRedis();
  await startServer();
})();








// SIGTERM signal detected and close the server
process.on('SIGTERM', () => {
  console.log('SIGTERM SIGNAL FOUND and server shutting down...');

  if (server) {
    server.close(() => {
      // server closing
      console.log('server closed');
      process.exit(1); // exit from server
    });
  } else {
    process.exit(1);
  }
});
// SIGINT signal send
process.on('SIGINT', (error) => {
  console.log(
    'SIGINT SIGNAL FOUND your server might be closed and server shutting down...',
    error
  );

  if (server) {
    server.close(() => {
      // server closing
      console.log('server closed');
      process.exit(1); // exit from server
    });
  } else {
    process.exit(1);
  }
});

// Unhandled rejection eror
process.on('unhandledRejection', (error) => {
  console.log('Unhandled rejection detected and server shutting down...', error);
});

// Unhandled rejection eror
process.on('uncaughtException', (error) => {
  console.log('Uncaught exception detected and server shutting down...', error);
});
