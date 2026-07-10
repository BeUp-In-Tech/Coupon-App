import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';

export const validateRequest =
  (ZodSchema: z.ZodTypeAny) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      
      if (req.body?.data) {
        req.body = JSON.parse(req.body.data);
      }

      req.body = await ZodSchema.parseAsync(req.body);
      next();
 
    } catch (error) {
      next(error);
    }
  };
