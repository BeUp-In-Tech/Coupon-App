/* eslint-disable @typescript-eslint/no-explicit-any */
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import stream from 'stream';
import AppError from '../errorHelpers/AppError';
import env from './env';
import { StatusCodes } from 'http-status-codes';
import { uploadLogger } from '../utils/logger/logger.child';


cloudinary.config({
  cloud_name: env?.CLOUDINARY_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_SECRET,
});

export const uploadBufferToCloudinary = async (
  buffer: Buffer,
  fileName: string
): Promise<UploadApiResponse | undefined> => {
  try {
    return new Promise((resolve, reject) => {
      const public_id = `${fileName}-${Date.now()}`;

      const bufferStream = new stream.PassThrough();
      bufferStream.end(buffer);

      cloudinary.uploader
        .upload_stream(
          {
            resource_type: 'auto',
            public_id: public_id,
            folder: 'pdf',
          },
          (error, result) => {
            if (error) {
              return reject(error);
            }
            resolve(result);
          }
        )
        .end(buffer);
    });
  } catch (error: any) {
   uploadLogger.error({error}, 'Cloudinary buffer upload error');
    throw new AppError(401, `Error uploading file ${error.message}`);
  }
};

export const deleteImageFromCLoudinary = async (url: string) => {
  try {
    const regex = /\/v\d+\/(.*?)\.(jpg|jpeg|png|gif|webp|avif)$/i;
    const match = url.match(regex);

    if (match && match[1]) {
      const public_id = match[1];
      await cloudinary.uploader.destroy(public_id);
    }
  } catch (error: any) {
    uploadLogger.error({error}, 'Cloudinary image deletion error');
    throw new AppError(StatusCodes.INTERNAL_SERVER_ERROR, 'Cloudinary image deletion failed', error.message);
  }
};

export const cloudinaryUpload = cloudinary;

