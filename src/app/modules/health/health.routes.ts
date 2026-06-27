import { Router } from 'express';
import { healthControllers } from './health.controller';

const router = Router();

router.get('/', healthControllers.getSystemHealth);

export const healthRouter = router;
