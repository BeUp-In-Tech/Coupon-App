/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-explicit-any */
import nodemailer from 'nodemailer';
import env from '../config/env';
import AppError from '../errorHelpers/AppError';
import path from 'path';
import ejs from 'ejs';

const emailPort = Number(env.EMAIL_PORT);
const emailSecure = emailPort === 465;

const transporter = nodemailer.createTransport({
  secure: emailSecure,
  auth: {
    user: env.EMAIL_USER,
    pass: env.EMAIL_PASSWORD,
  },
  port: emailPort,
  host: env.EMAIL_HOST,
  connectionTimeout: 30_000,
  greetingTimeout: 30_000,
  socketTimeout: 60_000,
});

interface SendEmailOptions {
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
    encoding?: BufferEncoding;
  }[];
}

export const sendEmail = async ({
  to,
  cc,
  bcc,
  subject,
  templateName,
  templateData = {},
  attachments,
}: SendEmailOptions) => {
  try {
    const templatePath = path.join(__dirname, `templates/${templateName}.ejs`);
    const html = await ejs.renderFile(templatePath, templateData);
    await transporter.sendMail({
      from: `"${env.EMAIL_FROM_NAME}" <${env.EMAIL_FROM}>`,
      to: to,
      cc,
      bcc,
      subject: subject,
      html: html,
      attachments: attachments?.map((attachment) => ({
        filename: attachment.filename,
        content: attachment.content,
        contentType: attachment.contentType,
        encoding: attachment.encoding,
      })),
    });
  } catch (error: any) {
    console.log('Email sending error', error);
    throw new AppError(400, 'Email error');
  }
};
