import { NextFunction, Request, Response, Router } from 'express';
import { Location } from '../location/location.model';
import { SendResponse } from '../../utils/SendResponse';

const router = Router();

router.get(
  '/location',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Migrate "outlet_name" -> "location_name"
      const result = await Location.collection.updateMany(
        { outlet_name: { $exists: true } },
        [
          {
            $set: {
              location_name: '$outlet_name',
            },
          },
          {
            $unset: 'outlet_name',
          },
        ]
      );

      SendResponse(res, {
        success: true,
        statusCode: 200,
        message: 'Location migrated',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

export const migrationRouter = router;
