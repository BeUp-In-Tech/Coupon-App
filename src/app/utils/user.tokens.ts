import { JwtPayload } from "jsonwebtoken";
import env from "../config/env";
import { generateToken } from "./jwt";

export const createUserTokens = async (user: JwtPayload) => {
  const jwtPayload  = {
    userId: user?._id,
    email: user?.email,
    role: user?.role,
    isVerified: user?.isVerified
  };

  // Jsonwebtoken
  const accessToken = generateToken(
    jwtPayload,
    env?.JWT_ACCESS_SECRET,
    env?.JWT_ACCESS_EXPIRATION
  );
  const refreshToken = generateToken(
    jwtPayload,
    env?.JWT_REFRESH_SECRET,
    env?.JWT_REFRESH_EXPIRATION
  );

  return {
    accessToken,
    refreshToken,
  };
};