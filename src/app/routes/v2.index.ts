import { Router } from 'express';
import { dealV2Router } from '../modules/deal/v2/deal.routes';

export const v2Router = Router();

v2Router.use('/service', dealV2Router);
