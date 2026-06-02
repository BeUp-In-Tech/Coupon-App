/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-explicit-any */
import nodemailer from 'nodemailer';
import env from '../config/env';
import AppError from '../errorHelpers/AppError';
import path from 'path';
import ejs from 'ejs';

const transporter = nodemailer.createTransport({
  secure: true,
  auth: {
    user: env.EMAIL_USER,
    pass: env.EMAIL_PASSWORD,
  },
  port: Number(env.EMAIL_PORT),
  host: env.EMAIL_HOST,
});

export interface SendEmailOptions {
  to: string;
  cc?: string[];
  bcc?: string[];
  subject: string;
  templateName: string;
  templateData?: Record<string, any>;
  attachments?: {
    filename: string;
    content: Buffer | string;
    contentType: string;
  }[];
}

const convertHtmlToText = (html: string) =>
  html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*\/p\s*>/gi, '\n\n')
    .replace(/<\s*\/div\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

const getUnsubscribeUrl = () =>
  env.BACKEND_URL ? `${env.BACKEND_URL}/api/v1/auth/unsubscribe` : null;

export const sendEmail = async ({
  to,
  cc,
  bcc,
  subject,
  templateName,
  templateData,
  attachments,
}: SendEmailOptions) => {
  try {
    const templatePath = path.join(__dirname, `templates/${templateName}.ejs`);

    const html = await ejs.renderFile(templatePath, templateData ?? {});
    const textFallback = convertHtmlToText(html) || 'YeppAds';
    const unsubscribeUrl = getUnsubscribeUrl();
    const unsubscribeMail = env.UNSUBSCRIBE_MAIL?.trim();
    const unsubscribeHeaderParts = [
      unsubscribeMail ? `<mailto:${unsubscribeMail}>` : null,
      unsubscribeUrl ? `<${unsubscribeUrl}>` : null,
    ].filter(Boolean) as string[];
    const shouldIncludeUnsubscribeHeaders = unsubscribeHeaderParts.length > 0;

    const mailOptions: nodemailer.SendMailOptions = {
      from: `"${env.EMAIL_FROM_NAME}" <${env.EMAIL_FROM}>`,
      to,
      cc,
      bcc,
      subject,
      text: textFallback,
      html,
      attachments: attachments?.map((attachment) => ({
        filename: attachment.filename,
        content: attachment.content,
        contentType: attachment.contentType,
      })),
    };

    if (shouldIncludeUnsubscribeHeaders) {
      mailOptions.headers = {
        'List-Unsubscribe': unsubscribeHeaderParts.join(', '),
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      };

      if (unsubscribeUrl) {
        mailOptions.list = {
          unsubscribe: {
            url: unsubscribeUrl,
            comment: 'Unsubscribe',
          },
        };
      } else if (unsubscribeMail) {
        mailOptions.list = {
          unsubscribe: {
            url: `mailto:${unsubscribeMail}`,
            comment: 'Unsubscribe',
          },
        };
      }
    }

    await transporter.sendMail(mailOptions);
  } catch (error: any) {
    console.log('Email sending error', error.message);
    throw new AppError(400, 'Email error');
  }
};

