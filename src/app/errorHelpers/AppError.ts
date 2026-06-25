class AppError extends Error {
  public statusCode: number;
  public module: string;

  constructor(statusCode: number, message: string, module = '',stack = '') {
    super(message);
    this.statusCode = statusCode;
    this.module = module;

    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

export default AppError;
