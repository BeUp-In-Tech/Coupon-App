import express, { Request, Response } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { router } from './app/routes';
import { globalErrorHandler } from './app/middlewares/globalErrorHandler';
import { NotFound } from './app/middlewares/NotFound';
import rateLimit from 'express-rate-limit';
import { safeSanitizeMiddleware } from './app/middlewares/mongoSanitizer';
import env from './app/config/env';
import session from 'express-session';
import passport from 'passport';
import './app/config/passport.config';
import { paymentControllers } from './app/modules/payment/payment.controllers';
import { RedisStore } from 'connect-redis';
import { redisClient } from './app/config/redis.config';
import helmet from 'helmet';
import { httpLogger } from './app/middlewares/httpLogger.middleware';
import { requestId } from './app/middlewares/requestId.middleware';
import { v2Router } from './app/routes/v2.index';

const app = express();
app.use(requestId);
app.use(httpLogger);

app.disable('x-powered-by');

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// Stripe webhook must stay before express.json()
app.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  paymentControllers.stripeWebhook
);

app.set('trust proxy', 1);

// CORS
const allowedOrigins = env.CORS_URL.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  })
);

// Optional: you can keep cookieParser if you use signed/custom cookies elsewhere
app.use(cookieParser());

// Normal body parsers
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

app.use(safeSanitizeMiddleware);

// Redis session store
const redisStore = new RedisStore({
  client: redisClient,
  prefix: 'yeppads:sess:',
});

app.use(
  session({
    store: redisStore,
    secret: env.EXPRESS_SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    name: 'yeppads.sid',
    cookie: {
      httpOnly: true,
      secure: env.NODE_ENV === 'production', // true on HTTPS
      sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax', // cross-origin frontend support
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());

const limiter = rateLimit({
  windowMs: env.REQUEST_RATE_LIMIT_TIME * 60 * 1000,
  max: env.REQUEST_RATE_LIMIT,
  standardHeaders: true,
  legacyHeaders: false,
  statusCode: 429,
  message: {
    success: false,
    statusCode: 429,
    message: 'Too many requests, please try again later.',
  },
});

app.use(limiter);

app.get('/', (req: Request, res: Response) => {
  res.send('Welcome to the show');
});

app.use('/api/v1', router);
app.use('/api/v2', v2Router);

app.use(globalErrorHandler);
app.use(NotFound);

export default app;
