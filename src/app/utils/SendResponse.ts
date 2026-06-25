import { Response } from 'express';


interface TResponse<T> {
  statusCode: number;
  success: boolean;
  message: string;
  trace_id: string;
  data: T;
}

export const SendResponse = <T>(res: Response, data: TResponse<T>) => {
  res.status(data.statusCode).json({
    statusCode: data.statusCode,
    success: data.success,
    message: data.message,
    data: data.data,
    trace_id: data.trace_id,
  });
};
