/* eslint-disable @typescript-eslint/no-explicit-any */
import mongoose from 'mongoose';
import User from '../../modules/user/user.model';
import { IUser } from '../../modules/user/user.interface';
import { NotificationModel } from '../../modules/notification/notification.model';
import { NotifyInputSchema } from '../../modules/notification/notification.validate';
import AppError from '../../errorHelpers/AppError';
import { StatusCodes } from 'http-status-codes';
import admin from '../../config/firebase.config';



 // Remove invalid tokens from DB (keeps future sends fast + clean)
async function cleanupInvalidTokens(params: {
  userId: mongoose.Types.ObjectId;
  invalidTokens: string[];
}) {
  const { userId, invalidTokens } = params;
  if (!invalidTokens.length) return;

  await User.updateOne(
    { _id: userId },
    { $pull: { deviceTokens: { token: { $in: invalidTokens } } } }
  );
}


//Collect active tokens
function getActiveTokens(
  userDoc: Pick<IUser, 'deviceTokens'> | null
): string[] {
  if (!userDoc?.deviceTokens?.length) return [];

  const uniqueTokens = new Set<string>();

  for (const device of userDoc.deviceTokens) {
    if (!device) continue;

    // must be active
    if (!device.isActive) continue;


    // validate token
    if (typeof device.token !== 'string') continue;
    if (device.token.trim().length < 10) continue;

    uniqueTokens.add(device.token.trim());
  }

  return Array.from(uniqueTokens);
}

/**
 * notifyUser
 * - saves DB notification
 * - sends FCM (optional)
 * - cleans invalid FCM tokens
 */
export async function notifyUser(input: unknown) {
  const parsed = NotifyInputSchema.parse(input);
  const userId = new mongoose.Types.ObjectId(parsed.user);

  // Security: never send secrets in push data (you control input)
  // FCM "data" must be string values
  const safeData: Record<string, string> = { ...parsed.data };

  // 1) Save notification in DB first
  const notificationDoc = await NotificationModel.create({
    user: userId,
    title: parsed.title,
    body: parsed.body,

    type: parsed.type,
    entityId: parsed.entityId,

    webUrl: parsed.webUrl,
    deepLink: parsed.deepLink,

    isRead: false,
    data: safeData,
  });

  const notificationId = String(notificationDoc._id);

  // 3.1) Load active device tokens from DB
  const user = await User.findById(userId).select('deviceTokens').lean();
  const tokens = getActiveTokens(user);

  if (!tokens.length) {
       throw new AppError(StatusCodes.NOT_FOUND, "NO_ACTIVE_TOKENS");
  }

  // 3.2) Build FCM message (multicast)
  const message = {
    tokens,
    notification: {
      title: parsed.title,
      body: parsed.body || '',
    },
    data: {
      notificationId,
      type: parsed.type,
      entityId: parsed.entityId || '',
      webUrl: parsed.webUrl || '',
      deepLink: parsed.deepLink || '',
      ...safeData,
    },
  };

  // 3.3) Send
  let response;
  try {
    response = await admin.messaging().sendEachForMulticast(message);
  } catch (err: any) {
    // DB is saved; push failed; return gracefully
    return {
      success: true,
      notificationId,
      pushed: false,
      tokensUsed: tokens.length,
      pushError: err?.message || 'FCM_SEND_FAILED',
    };
  }

  // 3.4) Cleanup invalid tokens
  const invalidTokens: string[] = [];
  response.responses.forEach((r: admin.messaging.SendResponse, idx: number) => {
    if (r.success) return;
    const code: string = r.error?.code || '';

    if (
      code === 'messaging/registration-token-not-registered' ||
      code === 'messaging/invalid-registration-token'
    ) {
      invalidTokens.push(tokens[idx]);
    }
  });

  if (invalidTokens.length) {
    await cleanupInvalidTokens({ userId, invalidTokens });
  }

  return {
    success: true,
    notificationId,
    pushed: response.successCount > 0,
    tokensUsed: tokens.length,
    successCount: response.successCount,
    failureCount: response.failureCount,
    cleanedInvalidTokens: invalidTokens.length,
  };
}
