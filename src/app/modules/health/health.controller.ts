import { NextFunction, Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { CatchAsync } from '../../utils/CatchAsync';
import { SendResponse } from '../../utils/SendResponse';
import { healthServices } from './health.service';

const getSystemHealth = CatchAsync(
  async (req: Request, res: Response, _next: NextFunction) => {
    const result = await healthServices.getSystemHealthService();
    const statusCode =
      result.status === 'ok' ? StatusCodes.OK : StatusCodes.SERVICE_UNAVAILABLE;

    res.set('Cache-Control', 'no-store');

    SendResponse(res, {
      success: result.status === 'ok',
      statusCode,
      message:
        result.status === 'ok'
          ? 'System is healthy'
          : 'System health is degraded',
      trace_id: req.id as string,
      data: result,
    });
  }
);

export const healthControllers = {
  getSystemHealth,
};
