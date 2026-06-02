import dotenv from 'dotenv';
dotenv.config();

interface EnvInterfaces {
  PORT: string;
  MONGO_URI: string;
  NODE_ENV: 'development' | 'production';

  JWT_ACCESS_SECRET: string;
  JWT_ACCESS_EXPIRATION: string;
  JWT_REFRESH_SECRET: string;
  JWT_REFRESH_EXPIRATION: string;
  OTP_JWT_ACCESS_SECRET: string;
  OTP_JWT_ACCESS_EXPIRATION: string;

  BCRYPT_SALT_ROUND: string;
  FRONTEND_URL: string;
  DEEP_LINK: string;
  BACKEND_URL: string;

  CLOUDINARY_SECRET: string;
  CLOUDINARY_API_KEY: string;
  CLOUDINARY_NAME: string;

  ADMIN_MAIL: string;
  ADMIN_PASSWORD: string;

  REDIS_HOST: string;
  REDIS_PORT: string;

  REQUEST_RATE_LIMIT: number;
  REQUEST_RATE_LIMIT_TIME: number;

  EMAIL_HOST: string;
  EMAIL_PORT: string;
  EMAIL_USER: string;
  EMAIL_FROM: string;
  EMAIL_FROM_NAME: string;
  EMAIL_PASSWORD: string;
  UNSUBSCRIBE_MAIL: string;

  GOOGLE_OAUTH_ID: string;
  GOOGLE_OAUTH_SECRET: string;
  GOOGLE_CALLBACK_URL: string;

  GOOGLE_ANDROID_CLIENT_ID: string;
  GOOGLE_IOS_CLIENT_ID: string;

  APPLE_TEAM_ID: string;
  APPLE_KEY_ID: string;
  APPLE_PRIVATE_KEY: string;
  APPLE_IOS_CLIENT_ID: string;
  APPLE_WEB_CLIENT_ID: string;
  APPLE_WEB_REDIRECT_URI: string;

  EXPRESS_SESSION_SECRET: string;

  TYPE: string;
  PROJECT_ID: string;
  PRIVATE_KEY_ID: string;
  PRIVATE_KEY: string;
  CLIENT_EMAIL: string;
  CLIENT_ID: string;
  AUTH_URI: string;
  TOKEN_URI: string;
  AUTH_PROVIDER_X509_CERT_URL: string;
  CLIENT_X509_CERT_URL: string;
  UNIVERSE_DOMAIN: string;

  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
}

const loadEnvVariables = (): EnvInterfaces => {
  const requireEnvVariables: string[] = [
    'PORT',
    'MONGO_URI',
    'NODE_ENV',

    'JWT_ACCESS_SECRET',
    'JWT_ACCESS_EXPIRATION',
    'JWT_REFRESH_SECRET',
    'JWT_REFRESH_EXPIRATION',
    'OTP_JWT_ACCESS_SECRET',
    'OTP_JWT_ACCESS_EXPIRATION',

    'BCRYPT_SALT_ROUND',
    'FRONTEND_URL',
    'DEEP_LINK',
    'BACKEND_URL',

    'CLOUDINARY_NAME',
    'CLOUDINARY_SECRET',
    'CLOUDINARY_API_KEY',

    'ADMIN_MAIL',
    'ADMIN_PASSWORD',

    'REQUEST_RATE_LIMIT',
    'REQUEST_RATE_LIMIT_TIME',

    'REDIS_HOST',
    'REDIS_PORT',

    'EMAIL_HOST',
    'EMAIL_PORT',
    'EMAIL_USER',
    'EMAIL_FROM',
    'EMAIL_FROM_NAME',
    'EMAIL_PASSWORD',
    'UNSUBSCRIBE_MAIL',

    'GOOGLE_OAUTH_SECRET',
    'GOOGLE_OAUTH_ID',
    'GOOGLE_CALLBACK_URL',
    'GOOGLE_IOS_CLIENT_ID',
    'GOOGLE_ANDROID_CLIENT_ID',

    'APPLE_TEAM_ID',
    'APPLE_KEY_ID',
    'APPLE_PRIVATE_KEY',
    'APPLE_IOS_CLIENT_ID',
    'APPLE_WEB_CLIENT_ID',
    'APPLE_WEB_REDIRECT_URI',

    'EXPRESS_SESSION_SECRET',

    'TYPE',
    'PROJECT_ID',
    'PRIVATE_KEY_ID',
    'PRIVATE_KEY',
    'CLIENT_EMAIL',
    'CLIENT_ID',
    'AUTH_URI',
    'TOKEN_URI',
    'AUTH_PROVIDER_X509_CERT_URL',
    'CLIENT_X509_CERT_URL',
    'UNIVERSE_DOMAIN',

    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
  ];

  requireEnvVariables.forEach((KEY) => {
    if (!process.env[KEY]) {
      throw new Error(`Missing required env variable ${KEY}`);
    }
  });

  return {
    MONGO_URI: process.env.MONGO_URI as string,
    PORT: process.env.PORT as string,
    NODE_ENV: process.env.NODE_ENV as 'development' | 'production',
    BCRYPT_SALT_ROUND: process.env.BCRYPT_SALT_ROUND as string,

    JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET as string,
    JWT_ACCESS_EXPIRATION: process.env.JWT_ACCESS_EXPIRATION as string,

    JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET as string,
    JWT_REFRESH_EXPIRATION: process.env.JWT_REFRESH_EXPIRATION as string,

    OTP_JWT_ACCESS_SECRET: process.env.OTP_JWT_ACCESS_SECRET as string,
    OTP_JWT_ACCESS_EXPIRATION: process.env.OTP_JWT_ACCESS_EXPIRATION as string,

    FRONTEND_URL: process.env.FRONTEND_URL as string,
    DEEP_LINK: process.env.DEEP_LINK as string,
    BACKEND_URL: process.env.BACKEND_URL as string,

    CLOUDINARY_SECRET: process.env.CLOUDINARY_SECRET as string,
    CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY as string,
    CLOUDINARY_NAME: process.env.CLOUDINARY_NAME as string,

    ADMIN_MAIL: process.env.ADMIN_MAIL as string,
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD as string,

    REQUEST_RATE_LIMIT_TIME: Number(
      process.env.REQUEST_RATE_LIMIT_TIME
    ) as number,
    REQUEST_RATE_LIMIT: Number(process.env.REQUEST_RATE_LIMIT) as number,

    REDIS_HOST: process.env.REDIS_HOST as string,
    REDIS_PORT: process.env.REDIS_PORT as string,

    EMAIL_PASSWORD: process.env.EMAIL_PASSWORD as string,
    EMAIL_USER: process.env.EMAIL_USER as string,
    EMAIL_FROM: process.env.EMAIL_FROM as string,
    EMAIL_FROM_NAME: process.env.EMAIL_FROM_NAME as string,
    EMAIL_PORT: process.env.EMAIL_PORT as string,
    EMAIL_HOST: process.env.EMAIL_HOST as string,
    UNSUBSCRIBE_MAIL: process.env.UNSUBSCRIBE_MAIL as string,

    GOOGLE_OAUTH_ID: process.env.GOOGLE_OAUTH_ID as string,
    GOOGLE_OAUTH_SECRET: process.env.GOOGLE_OAUTH_SECRET as string,
    GOOGLE_CALLBACK_URL: process.env.GOOGLE_CALLBACK_URL as string,
    GOOGLE_ANDROID_CLIENT_ID: process.env.GOOGLE_ANDROID_CLIENT_ID as string,
    GOOGLE_IOS_CLIENT_ID: process.env.GOOGLE_IOS_CLIENT_ID as string,

    APPLE_TEAM_ID: process.env.APPLE_TEAM_ID as string,
    APPLE_KEY_ID: process.env.APPLE_KEY_ID as string,
    APPLE_PRIVATE_KEY: process.env.APPLE_PRIVATE_KEY as string,
    APPLE_IOS_CLIENT_ID: process.env.APPLE_IOS_CLIENT_ID as string,
    APPLE_WEB_CLIENT_ID: process.env.APPLE_WEB_CLIENT_ID as string,
    APPLE_WEB_REDIRECT_URI: process.env.APPLE_WEB_REDIRECT_URI as string,

    EXPRESS_SESSION_SECRET: process.env.EXPRESS_SESSION_SECRET as string,

    TYPE: process.env.TYPE as string,
    PROJECT_ID: process.env.PROJECT_ID as string,
    PRIVATE_KEY_ID: process.env.PRIVATE_KEY_ID as string,
    PRIVATE_KEY: process.env.PRIVATE_KEY as string,
    CLIENT_EMAIL: process.env.CLIENT_EMAIL as string,
    CLIENT_ID: process.env.CLIENT_ID as string,
    AUTH_URI: process.env.AUTH_URI as string,
    TOKEN_URI: process.env.TOKEN_URI as string,
    AUTH_PROVIDER_X509_CERT_URL: process.env.AUTH_PROVIDER_X509_CERT_URL as string,
    CLIENT_X509_CERT_URL: process.env.CLIENT_X509_CERT_URL as string,
    UNIVERSE_DOMAIN: process.env.UNIVERSE_DOMAIN as string,

    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY as string,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET as string,
  };
};

export default loadEnvVariables();
