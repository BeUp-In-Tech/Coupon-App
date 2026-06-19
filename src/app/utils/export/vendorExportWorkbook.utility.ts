import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import ExcelJS from 'exceljs';
import { Types } from 'mongoose';
import { Location } from '../../modules/location/location.model';
import { ShopApproval } from '../../modules/shop/shop.interface';
import { Shop } from '../../modules/shop/shop.model';
import User from '../../modules/user/user.model';

// Keep database and workbook memory bounded while processing large exports.
const EXPORT_BATCH_SIZE = 5000;
// Excel reserves one of its 1,048,576 worksheet rows for the header.
const XLSX_MAX_DATA_ROWS_PER_SHEET = 1_048_575;

// Completed exports remain downloadable for one hour.
export const VENDOR_EXPORT_TTL_MS = 60 * 60 * 1000;
// OS temp storage prevents generated files from triggering frontend live reloads.
export const VENDOR_EXPORT_DIRECTORY = path.join(
  tmpdir(),
  'yepp-ads',
  'vendor-exports'
);

interface IExportShop {
  _id: Types.ObjectId;
  vendor: Types.ObjectId;
  business_name: string;
  business_email: string;
  shop_approval: ShopApproval;
}

interface ILocationSummary {
  _id: Types.ObjectId;
  locationCount: number;
  city?: string;
  state?: string;
}

interface IGenerateVendorExportParams {
  filePath: string;
  totalVendors: number;
  onProgress: (progress: number) => Promise<void>;
}

// Match vendor_stats: multiple location records make both fields "Multiple".
const summarizeLocationValue = (
  locationCount: number,
  value?: string
) => {
  if (locationCount > 1) return 'Multiple';
  return value || 'N/A';
};

// Create each worksheet with the same columns, styling, and frozen header row.
const configureWorksheet = (
  workbook: ExcelJS.stream.xlsx.WorkbookWriter,
  sheetNumber: number
) => {
  const worksheet = workbook.addWorksheet(
    sheetNumber === 1 ? 'Vendors' : `Vendors ${sheetNumber}`,
    { views: [{ state: 'frozen', ySplit: 1 }] }
  );

  worksheet.columns = [
    { header: 'Business Name', key: 'businessName', width: 32 },
    { header: 'Business Email', key: 'businessEmail', width: 34 },
    { header: 'User Name', key: 'userName', width: 28 },
    { header: 'Shop Status', key: 'shopStatus', width: 18 },
    { header: 'City', key: 'city', width: 24 },
    { header: 'State', key: 'state', width: 24 },
  ];

  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1F4E78' },
  };
  headerRow.commit();

  return worksheet;
};

// Stream every vendor into XLSX without retaining the full dataset in memory.
export const generateVendorExportWorkbook = async ({
  filePath,
  totalVendors,
  onProgress,
}: IGenerateVendorExportParams) => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
    filename: filePath,
    useStyles: true,
    useSharedStrings: false,
  });

  let worksheet = configureWorksheet(workbook, 1);
  let sheetNumber = 1;
  let rowsInCurrentSheet = 0;
  let processedVendors = 0;
  let lastShopId: Types.ObjectId | undefined;

  try {
    while (true) {
      // Keyset pagination remains fast for large collections and avoids skip().
      const filter = lastShopId ? { _id: { $gt: lastShopId } } : {};
      const shops = (await Shop.find(filter)
        .sort({ _id: 1 })
        .limit(EXPORT_BATCH_SIZE)
        .select('vendor business_name business_email shop_approval')
        .lean()) as IExportShop[];

      if (shops.length === 0) break;

      const vendorIds = shops.map((shop) => shop.vendor);
      const shopIds = shops.map((shop) => shop._id);

      // Fetch related users and location summaries once per batch to avoid N+1 queries.
      const [users, locationSummaries] = await Promise.all([
        User.find({ _id: { $in: vendorIds } })
          .select('user_name')
          .lean(),
        Location.aggregate<ILocationSummary>([
          { $match: { shop: { $in: shopIds } } },
          {
            $group: {
              _id: '$shop',
              locationCount: { $sum: 1 },
              city: { $first: '$address.city' },
              state: { $first: '$address.state' },
            },
          },
        ]),
      ]);

      const userNameById = new Map(
        users.map((user) => [user._id.toString(), user.user_name])
      );
      const locationByShopId = new Map(
        locationSummaries.map((summary) => [summary._id.toString(), summary])
      );

      for (const shop of shops) {
        // Continue in a new sheet before reaching Excel's worksheet row limit.
        if (rowsInCurrentSheet === XLSX_MAX_DATA_ROWS_PER_SHEET) {
          worksheet.commit();
          sheetNumber += 1;
          worksheet = configureWorksheet(workbook, sheetNumber);
          rowsInCurrentSheet = 0;
        }

        const location = locationByShopId.get(shop._id.toString());
        worksheet
          .addRow({
            businessName: shop.business_name,
            businessEmail: shop.business_email,
            userName: userNameById.get(shop.vendor.toString()) || 'N/A',
            shopStatus: shop.shop_approval,
            city: summarizeLocationValue(
              location?.locationCount || 0,
              location?.city
            ),
            state: summarizeLocationValue(
              location?.locationCount || 0,
              location?.state
            ),
          })
          .commit();

        rowsInCurrentSheet += 1;
      }

      processedVendors += shops.length;
      lastShopId = shops[shops.length - 1]._id;
      // Reserve 100% for a successfully committed workbook file.
      const progress = totalVendors
        ? Math.min(99, Math.floor((processedVendors / totalVendors) * 100))
        : 100;
      await onProgress(progress);
    }

    worksheet.commit();
    await workbook.commit();
    await onProgress(100);

    return processedVendors;
  } catch (error) {
    await fs.rm(filePath, { force: true }).catch(() => undefined);
    throw error;
  }
};

// Remove XLSX files after their one-hour download window has elapsed.
export const cleanupExpiredVendorExports = async () => {
  await fs.mkdir(VENDOR_EXPORT_DIRECTORY, { recursive: true });
  const files = await fs.readdir(VENDOR_EXPORT_DIRECTORY, {
    withFileTypes: true,
  });
  const expiryThreshold = Date.now() - VENDOR_EXPORT_TTL_MS;

  await Promise.all(
    files
      .filter((file) => file.isFile() && file.name.endsWith('.xlsx'))
      .map(async (file) => {
        const filePath = path.join(VENDOR_EXPORT_DIRECTORY, file.name);
        const stats = await fs.stat(filePath);
        if (stats.mtimeMs < expiryThreshold) {
          await fs.rm(filePath, { force: true });
        }
      })
  );
};

// Only allow download paths created inside the dedicated XLSX temp directory.
export const isVendorExportPathSafe = (filePath: string) =>
  path.dirname(path.resolve(filePath)) === VENDOR_EXPORT_DIRECTORY &&
  path.extname(filePath).toLowerCase() === '.xlsx';
