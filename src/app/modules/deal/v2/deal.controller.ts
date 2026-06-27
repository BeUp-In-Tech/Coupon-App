import { Request, Response } from 'express';
import { JwtPayload } from 'jsonwebtoken';
import { StatusCodes } from 'http-status-codes';
import { CatchAsync } from '../../../utils/CatchAsync';
import { SendResponse } from '../../../utils/SendResponse';
import { IDeal } from '../deal.interface';
import { dealV2Services } from './deal.service';

const createDeal = CatchAsync(async (req: Request, res: Response) => {
  const result = await dealV2Services.createDealV2Service({
    user: req.user as JwtPayload,
    payload: req.body as IDeal,
  });

  SendResponse(res, {
    success: true,
    statusCode: StatusCodes.CREATED,
    message: 'Deal created',
    trace_id: req.id as string,
    data: result,
  });
});

const updateDeal = CatchAsync(async (req: Request, res: Response) => {
  const result = await dealV2Services.updateDealV2Service(
    req.user as JwtPayload,
    req.params.dealId as string,
    req.body as IDeal
  );

  SendResponse(res, {
    success: true,
    statusCode: StatusCodes.OK,
    message: 'Deal updated',
    trace_id: req.id as string,
    data: result,
  });
});

export const dealV2Controllers = {
  createDeal,
  updateDeal,
};
