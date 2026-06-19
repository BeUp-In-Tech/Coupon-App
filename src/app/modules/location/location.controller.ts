/* eslint-disable @typescript-eslint/no-unused-vars */
import { NextFunction, Request, Response } from 'express';
import { CatchAsync } from '../../utils/CatchAsync';
import { SendResponse } from '../../utils/SendResponse';
import { StatusCodes } from 'http-status-codes';
import { JwtPayload } from 'jsonwebtoken';
import { locationServices } from './location.service';


const downloadBulkLocationTemplate = CatchAsync(
  async (_req: Request, res: Response, _next: NextFunction) => {
    const template = await locationServices.generateBulkLocationTemplate();

    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition':
        'attachment; filename="location-upload-template.xlsx"',
      'Content-Length': template.length.toString(),
    });
    res.send(template);
  }
);

const previewBulkLocations = CatchAsync(
  async (req: Request, res: Response, _next: NextFunction) => {
    const { userId } = req.user as JwtPayload;
    const result = await locationServices.previewBulkLocationsService(
      userId,
      req.file
    );

    SendResponse(res, {
      success: true,
      statusCode: StatusCodes.OK,
      message: 'Location file validated successfully',
      data: result,
    });
  }
);

const confirmBulkLocations = CatchAsync(
  async (req: Request, res: Response, _next: NextFunction) => {
    const { userId } = req.user as JwtPayload;
    const result = await locationServices.confirmBulkLocationsService(
      userId,
      req.params.batchId as string
    );

    SendResponse(res, {
      success: true,
      statusCode: StatusCodes.CREATED,
      message: 'Valid locations imported successfully',
      data: result,
    });
  }
);

const createLocation = CatchAsync(
  async (req: Request, res: Response, _next: NextFunction) => {
    const { userId } = req.user as JwtPayload;

    const result = await locationServices.createLocationService(userId, req.body);

    SendResponse(res, {
      success: true,
      statusCode: StatusCodes.CREATED,
      message: 'Locations created',
      data: result,
    });
  }
);

const updateLocation = CatchAsync(
  async (req: Request, res: Response, _next: NextFunction) => {
    const { userId } = req.user as JwtPayload;
    const { l_id } = req.query as Record<string, string>;

    const result = await locationServices.updateLocationService(
      l_id,
      userId,
      req.body
    );

    SendResponse(res, {
      success: true,
      statusCode: StatusCodes.OK,
      message: 'Location successfully updated',
      data: result,
    });
  }
);

export const locationControllers = {
  downloadBulkLocationTemplate,
  previewBulkLocations,
  confirmBulkLocations,
  createLocation,
  updateLocation
};
