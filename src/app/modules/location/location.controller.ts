/* eslint-disable @typescript-eslint/no-unused-vars */
import { NextFunction, Request, Response } from 'express';
import { CatchAsync } from '../../utils/CatchAsync';
import { SendResponse } from '../../utils/SendResponse';
import { StatusCodes } from 'http-status-codes';
import { JwtPayload } from 'jsonwebtoken';
import { outletServices } from './location.service';

const createLocation = CatchAsync(
  async (req: Request, res: Response, _next: NextFunction) => {
    const { userId } = req.user as JwtPayload;

    const result = await outletServices.createLocationService(userId, req.body);

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

    const result = await outletServices.updateLocationService(
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
  createLocation,
  updateLocation
};
