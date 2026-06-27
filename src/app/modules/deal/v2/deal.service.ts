import { JwtPayload } from 'jsonwebtoken';
import { IDeal } from '../deal.interface';
import { dealsServices } from '../deal.service';

const createDealV2Service = async (params: {
  user: JwtPayload;
  payload: IDeal;
}) => dealsServices.createDealsService(params);

const updateDealV2Service = async (
  user: JwtPayload,
  dealId: string,
  payload: IDeal
) => dealsServices.updateDealsService(user, dealId, payload, { v2: true });

export const dealV2Services = {
  createDealV2Service,
  updateDealV2Service,
};
