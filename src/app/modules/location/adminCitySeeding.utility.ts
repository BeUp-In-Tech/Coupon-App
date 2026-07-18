/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { Readable } from 'stream';
import ExcelJS from 'exceljs';
import { StatusCodes } from 'http-status-codes';
import AppError from '../../errorHelpers/AppError';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ICitySeedRow {
  city: string;
  state: string;
}

export interface ICitySeedRowError {
  rowNumber: number;
  field: string;
  message: string;
}

export interface IParsedCitySeedFile {
  totalRows: number;
  rows: ICitySeedRow[];
  errors: ICitySeedRowError[];
}

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_ROWS = 35_000;
const EXPECTED_HEADERS = ['City', 'State'] as const;

// ── File loader ──────────────────────────────────────────────────────────────

const loadWorksheet = async (
  file: Express.Multer.File
): Promise<ExcelJS.Worksheet> => {
  const workbook = new ExcelJS.Workbook();

  try {
    if (file.originalname.toLowerCase().endsWith('.csv')) {
      return await workbook.csv.read(Readable.from(file.buffer), {
        map: (value) => (value === '' ? null : value),
      });
    }

    await workbook.xlsx.read(Readable.from(file.buffer));
    const worksheet = workbook.worksheets[0];
    if (!worksheet) throw new Error('No worksheet found');
    return worksheet;
  } catch {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'The uploaded file could not be read. Use .xlsx or .csv format.'
    );
  }
};

// ── Header validation ────────────────────────────────────────────────────────

const validateHeaders = (worksheet: ExcelJS.Worksheet): Map<string, number> => {
  const headerRow = worksheet.getRow(1);
  const columnMap = new Map<string, number>();

  for (let col = 1; col <= headerRow.cellCount; col++) {
    const raw = String(headerRow.getCell(col).value ?? '').trim();
    // Strip BOM from first cell
    const header = col === 1 ? raw.replace(/^\uFEFF/, '') : raw;
    if (EXPECTED_HEADERS.includes(header as typeof EXPECTED_HEADERS[number])) {
      columnMap.set(header, col);
    }
  }

  const missing = EXPECTED_HEADERS.filter((h) => !columnMap.has(h));
  if (missing.length > 0) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      `Missing required columns: ${missing.join(', ')}. Expected headers: City, State`
    );
  }

  return columnMap;
};

// ── Main parser ──────────────────────────────────────────────────────────────

/**
 * Parses an admin city seed CSV/XLSX file.
 * Expected columns: City, State
 * Returns valid deduplicated rows and a list of per-row errors.
 */
export const parseCitySeedFile = async (
  file: Express.Multer.File
): Promise<IParsedCitySeedFile> => {
  const worksheet = await loadWorksheet(file);
  const columnMap = validateHeaders(worksheet);

  const cityCol  = columnMap.get('City')!;
  const stateCol = columnMap.get('State')!;

  const rows: ICitySeedRow[] = [];
  const errors: ICitySeedRowError[] = [];
  // Track lowercase city+state to deduplicate within the file
  const seenKeys = new Set<string>();
  let totalRows = 0;

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
    const row = worksheet.getRow(rowNumber);
    const city  = String(row.getCell(cityCol).value  ?? '').trim();
    const state = String(row.getCell(stateCol).value ?? '').trim();

    // Skip completely empty rows
    if (!city && !state) continue;

    totalRows++;

    if (totalRows > MAX_ROWS) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        `File exceeds the maximum of ${MAX_ROWS} data rows`
      );
    }

    // Validate city
    if (!city) {
      errors.push({ rowNumber, field: 'City', message: 'City is required' });
      continue;
    }

    // Validate state
    if (!state) {
      errors.push({ rowNumber, field: 'State', message: 'State is required' });
      continue;
    }

    // Deduplicate within file
    const key = `${city.toLowerCase()}|${state.toLowerCase()}`;
    if (seenKeys.has(key)) {
      errors.push({
        rowNumber,
        field: 'City',
        message: `Duplicate row: "${city}, ${state}" appears more than once in the file`,
      });
      continue;
    }

    seenKeys.add(key);
    rows.push({ city, state });
  }

  if (totalRows === 0) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'The file has no data rows. Add at least one city and state.'
    );
  }

  return { totalRows, rows, errors };
};
