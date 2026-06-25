import { Readable } from 'stream';
import ExcelJS from 'exceljs';
import { StatusCodes } from 'http-status-codes';
import z from 'zod';
import AppError from '../../errorHelpers/AppError';
import {
  IBulkLocationRow,
  IBulkLocationRowError,
  ILocation,
} from './location.interface';

export const BULK_LOCATION_HEADERS = [
  { label: 'Location name', key: 'location_name' },
  { label: 'Street', key: 'street' },
  { label: 'Zip code', key: 'zip_code' },
  { label: 'City', key: 'city' },
  { label: 'State', key: 'state' },
  { label: 'Country', key: 'country' },
  { label: 'Longitude', key: 'longitude' },
  { label: 'Latitude', key: 'latitude' },
  { label: 'Is active', key: 'isActive' },
] as const;

type BulkLocationField = typeof BULK_LOCATION_HEADERS[number]['key'];

const MAX_BULK_LOCATION_ROWS = 5000;

const requiredText = (field: string) =>
  z.preprocess(
    (value) =>
      typeof value === 'string' || typeof value === 'number'
        ? String(value).trim()
        : value,
    z.string({ message: `${field} must be text` }).min(1, `${field} is required`)
  );

const coordinate = (field: string, min: number, max: number) =>
  z.preprocess(
    (value) => {
      if (typeof value === 'number') return value;
      if (typeof value === 'string' && value.trim() !== '') {
        return Number(value);
      }
      return value;
    },
    z
      .number({ message: `${field} must be a number` })
      .finite(`${field} must be a finite number`)
      .min(min, `${field} must be at least ${min}`)
      .max(max, `${field} must be at most ${max}`)
  );

const activeStatus = z.preprocess((value) => {
  if (value === undefined || value === null || value === '') return true;
  if (typeof value === 'boolean') return value;
  const normalizedValue = String(value).trim().toLowerCase();
  if (normalizedValue === '1' || normalizedValue === 'true') return true;
  if (normalizedValue === '0' || normalizedValue === 'false') return false;
  return value;
}, z.boolean({ message: 'isActive must be true, false, 1, 0, or blank' }));

const bulkLocationRowSchema = z.object({
  location_name: requiredText('location_name'),
  street: requiredText('street'),
  zip_code: requiredText('zip_code'),
  city: requiredText('city'),
  state: requiredText('state'),
  country: requiredText('country'),
  longitude: coordinate('longitude', -180, 180),
  latitude: coordinate('latitude', -90, 90),
  isActive: activeStatus,
});

const getCellValue = (cell: ExcelJS.Cell) => {
  const value = cell.value;

  if (value && typeof value === 'object') {
    return { invalid: true, value: '[non-scalar value]' };
  }

  return { invalid: false, value };
};

const normalizeFingerprintPart = (value: unknown) =>
  String(value ?? '').trim().toLowerCase();

export const createLocationFingerprint = (
  location: IBulkLocationRow | ILocation
) => {
  if ('longitude' in location) {
    return [
      location.location_name,
      location.street,
      location.zip_code,
      location.city,
      location.state,
      location.country,
      location.longitude,
      location.latitude,
    ]
      .map(normalizeFingerprintPart)
      .join('|');
  }

  return [
    location.location_name,
    location.address?.street,
    location.address?.zip_code,
    location.address?.city,
    location.address?.state,
    location.address?.country,
    location.location?.coordinates?.[0],
    location.location?.coordinates?.[1],
  ]
    .map(normalizeFingerprintPart)
    .join('|');
};

const loadWorksheet = async (file: Express.Multer.File) => {
  const workbook = new ExcelJS.Workbook();

  try {
    if (file.originalname.toLowerCase().endsWith('.csv')) {
      return await workbook.csv.read(Readable.from(file.buffer), {
        // Keep CSV cells as text so values such as zip code "0012" are not lost.
        map: (value) => (value === '' ? null : value),
      });
    }

    await workbook.xlsx.read(Readable.from(file.buffer));
    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      throw new Error('Workbook has no worksheet');
    }
    return worksheet;
  } catch {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'The uploaded location file could not be read'
    );
  }
};

const getHeaderColumns = (worksheet: ExcelJS.Worksheet) => {
  const headerRow = worksheet.getRow(1);
  const headerColumns = new Map<BulkLocationField, number>();
  const duplicateHeaders: string[] = [];
  const unexpectedHeaders: string[] = [];

  for (let column = 1; column <= headerRow.cellCount; column += 1) {
    const rawHeader = String(headerRow.getCell(column).value ?? '').trim();
    const header = column === 1 ? rawHeader.replace(/^\uFEFF/, '') : rawHeader;
    if (!header) continue;

    const configuredHeader = BULK_LOCATION_HEADERS.find(
      ({ label }) => label === header
    );
    if (!configuredHeader) {
      unexpectedHeaders.push(header);
      continue;
    }

    if (headerColumns.has(configuredHeader.key)) {
      duplicateHeaders.push(configuredHeader.label);
      continue;
    }

    headerColumns.set(configuredHeader.key, column);
  }

  const missingHeaders = BULK_LOCATION_HEADERS
    .filter(({ key }) => !headerColumns.has(key))
    .map(({ label }) => label);

  if (
    missingHeaders.length > 0 ||
    unexpectedHeaders.length > 0 ||
    duplicateHeaders.length > 0
  ) {
    const details = [
      missingHeaders.length ? `Missing: ${missingHeaders.join(', ')}` : '',
      unexpectedHeaders.length
        ? `Unexpected: ${unexpectedHeaders.join(', ')}`
        : '',
      duplicateHeaders.length
        ? `Duplicated: ${duplicateHeaders.join(', ')}`
        : '',
    ].filter(Boolean);

    throw new AppError(
      StatusCodes.BAD_REQUEST,
      `Invalid location headers. ${details.join('. ')}`
    );
  }

  return headerColumns;
};

interface IParseBulkLocationFileOptions {
  file: Express.Multer.File;
  existingFingerprints: Set<string>;
}

// Parse once, report every bad field, and retain only normalized valid rows.
export const parseBulkLocationFile = async ({
  file,
  existingFingerprints,
}: IParseBulkLocationFileOptions) => {
  const worksheet = await loadWorksheet(file);
  const headerColumns = getHeaderColumns(worksheet);

  const rows: IBulkLocationRow[] = [];
  const errors: IBulkLocationRowError[] = [];
  const uploadedFingerprints = new Set<string>();
  let totalRows = 0;

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const rawRow: Record<string, unknown> = {};
    let hasValue = false;
    let hasInvalidCell = false;

    BULK_LOCATION_HEADERS.forEach(({ key }) => {
      const column = headerColumns.get(key);
      if (column === undefined) return;

      const cell = getCellValue(row.getCell(column));
      rawRow[key] = cell.value;
      hasValue ||= cell.value !== null && cell.value !== undefined && cell.value !== '';

      if (cell.invalid) {
        hasInvalidCell = true;
        errors.push({
          rowNumber,
          field: key,
          value: cell.value,
          message: `${key} must contain a plain value, not a formula or object`,
        });
      }
    });

    if (!hasValue) continue;
    totalRows += 1;

    if (totalRows > MAX_BULK_LOCATION_ROWS) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        `A location file can contain at most ${MAX_BULK_LOCATION_ROWS} rows`
      );
    }

    if (hasInvalidCell) continue;

    const parsed = bulkLocationRowSchema.safeParse(rawRow);
    if (!parsed.success) {
      parsed.error.issues.forEach((issue) => {
        const field = String(issue.path[0] ?? 'row');
        errors.push({
          rowNumber,
          field,
          value: rawRow[field],
          message: issue.message,
        });
      });
      continue;
    }

    const location = parsed.data as IBulkLocationRow;
    const fingerprint = createLocationFingerprint(location);
    if (
      existingFingerprints.has(fingerprint) ||
      uploadedFingerprints.has(fingerprint)
    ) {
      errors.push({
        rowNumber,
        field: 'location_name',
        value: location.location_name,
        message: 'This location is duplicated',
      });
      continue;
    }

    uploadedFingerprints.add(fingerprint);
    rows.push(location);
  }

  if (totalRows === 0) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'The location file has no data rows');
  }

  return { totalRows, rows, errors };
};
