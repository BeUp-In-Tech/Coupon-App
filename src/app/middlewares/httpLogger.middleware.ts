/* eslint-disable @typescript-eslint/no-unused-vars */
import PinoHttp from "pino-http"
import { logger } from '../utils/logger/logger.config';
import { Request, Response } from "express";
import { JwtPayload } from "jsonwebtoken";

export const httpLogger = PinoHttp({
    logger,
    customProps: (req: Request, _res: Response) => {
        // pino-http expects an object from customProps
        const id = (req as Request).id || "id:" + Math.random().toString(36).substring(7);
        return { id };
    },

    customSuccessMessage: (req: Request, res: Response) => `${req.method} ${req.url} completed with status ${res.statusCode}`,
    customErrorMessage: (req: Request, res: Response) => `${req.method} ${req.url} failed with status ${res.statusCode}`,
    serializers: {
        req(req: Request) {
            return {
                trace_id: req.id,
                method: req.method,
                userAgent: req.headers['user-agent'],
                url: req.url,
                query: req.query,
                params: req.params,
                remoteAddress: req.ip,
            }
        },
        res(res: Response) {
            return {
                statusCode: res.statusCode
            }
        }
    }
})