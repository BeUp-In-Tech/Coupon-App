import multer from 'multer';
import { Request } from 'express';
import { cloudinaryUpload } from './cloudinary.config';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import path from 'path';
import AppError from '../errorHelpers/AppError';
import { StatusCodes } from 'http-status-codes';

const storage = new CloudinaryStorage({
  cloudinary: cloudinaryUpload,
  params: {
    public_id: (req: Request, file: Express.Multer.File) => {
      const fileName = file.originalname
        .toLowerCase()
        .replace(/\s+/g, '-') // replace spaces with dash
        // eslint-disable-next-line no-useless-escape
        .replace(/[^a-z0-9\-\.]/g, '') // remove unwanted chars
        .replace(/\.[^/.]+$/, ''); // remove the extension

      const uniqueFileName =
        Math.random().toString(15).substring(2) +
        '-' +
        Date.now() +
        '-' +
        fileName;

      return uniqueFileName;
    },
  },
});

export const multerUpload = multer({ storage: storage });
export const uploadMulter = multer({ storage: multer.memoryStorage() });

const BULK_LOCATION_EXTENSIONS = new Set(['.xlsx', '.csv']);
const BULK_LOCATION_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'application/csv',
  'application/vnd.ms-excel',
  'application/octet-stream',
]);

// Bulk files stay in memory only long enough to parse and validate them.
export const bulkLocationUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    const isSupported =
      BULK_LOCATION_EXTENSIONS.has(extension) &&
      BULK_LOCATION_MIME_TYPES.has(file.mimetype);

    if (!isSupported) {
      callback(
        new AppError(
          StatusCodes.BAD_REQUEST,
          'Only .xlsx and .csv location files are supported'
        )
      );
      return;
    }

    callback(null, true);
  },
});
