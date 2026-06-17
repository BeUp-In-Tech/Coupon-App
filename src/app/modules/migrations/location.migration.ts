import { NextFunction, Request, Response, Router } from 'express';
import { Location } from '../location/location.model';
import { SendResponse } from '../../utils/SendResponse';
import mongoose from 'mongoose';

export const router = Router();

router.get(
  '/location',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // 1) Migrate "outlet_name" -> "location_name" (if present)
      const renameResult = await Location.collection.updateMany(
        { outlet_name: { $exists: true } },
        [
          { $set: { location_name: '$outlet_name' } },
          { $unset: 'outlet_name' },
        ]
      );

      // 2) Convert legacy flat address + zip_code into address object
      //    - If `address` is a string, move it to `address.street` and
      //      move top-level `zip_code` into `address.zip_code`.
      const addressConvertResult = await Location.collection.updateMany(
        { address: { $type: 'string' } },
        [
          {
            $set: {
              address: {
                street: '$address',
                zip_code: { $ifNull: ['$zip_code', ''] },
                city: '',
                state: '',
                country: '',
              },
            },
          },
          { $unset: ['zip_code'] },
        ]
      );

      // 3) Ensure `location.type` exists and equals "Point" when coordinates present
      const ensurePointResult = await Location.collection.updateMany(
        { 'location.coordinates': { $exists: true }, 'location.type': { $exists: false } },
        [
          { $set: { 'location.type': 'Point' } },
        ]
      );

      // 4) For documents that still have top-level zip_code (but address is object), move zip_code into address.zip_code
      const moveZipIntoAddressResult = await Location.collection.updateMany(
        { zip_code: { $exists: true }, address: { $type: 'object' } },
        [
          {
            $set: {
              'address.zip_code': '$zip_code',
            },
          },
          { $unset: ['zip_code'] },
        ]
      );

      SendResponse(res, {
        success: true,
        statusCode: 200,
        message: 'Location migration completed',
        data: {
          renamedOutletNameCount: renameResult.modifiedCount ?? renameResult.matchedCount,
          addressConvertedCount: addressConvertResult.modifiedCount ?? addressConvertResult.matchedCount,
          ensuredPointCount: ensurePointResult.modifiedCount ?? ensurePointResult.matchedCount,
          movedZipCount: moveZipIntoAddressResult.modifiedCount ?? moveZipIntoAddressResult.matchedCount,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);


router.get(
  '/collection_rename',
  async (req: Request, res: Response, next: NextFunction) => {
     try {
      const db = mongoose.connection.db;

      if (!db) {
        return res.status(500).json({
          success: false,
          message: 'Database connection not available',
        });
      }

      const collections = await db.listCollections().toArray();

      const outletsExists = collections.some((c) => c.name === "Outlets");
      const locationsExists = collections.some((c) => c.name === "locations");

      if (!outletsExists) {
        return res.status(400).json({
          success: false,
          message: "Outlets collection does not exist",
        });
      }

      if (locationsExists) {
        return res.status(400).json({
          success: false,
          message: "locations collection already exists",
        });
      }

      await db.collection("Outlets").rename("locations");

      return res.status(200).json({
        success: true,
        message: "Collection renamed from Outlets to locations successfully",
      });
    } catch (error) {
      next(error);
    }
  }
);


export const migrationRouter = router;
