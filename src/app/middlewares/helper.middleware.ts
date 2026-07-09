import { NextFunction, Request, Response } from "express";


export const preParseMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  if (!req.body?.data) {
    req.body =  {
      ...req.body,
    }

    next();
    return;
  }

     req.body =  {
      ...req.body,
      ...JSON.parse(req.body?.data)
    }

    // DELETE EXTRA DATA (THIS DATA PARSED EARLIER)
    delete req.body.data;
    next();
  }