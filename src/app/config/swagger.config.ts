import swaggerUi from "swagger-ui-express"; 
import SwaggerParser from "@apidevtools/swagger-parser";
import { NextFunction, Request, Response } from "express";
import path from 'path';

const swaggerDocument = SwaggerParser.bundle(path.join(__dirname, '../docs/lamin.yaml'));
export const swaggerUiServer = swaggerUi.serve;
export const swaggerUiSetup = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const document = await swaggerDocument;
    return swaggerUi.setup(document)(req, res, next);
  } catch (error) {
    return next(error);
  }
};