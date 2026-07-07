/* eslint-disable @typescript-eslint/no-explicit-any */
import { Types } from 'mongoose';
import { DealModel } from '../../modules/deal/v1/deal.model';
import { notifyUser } from '../../utils/notification/push.notification';
import { NotificationType } from '../../modules/notification/notification.interface';
import env from '../../config/env';
import { workerLogger } from '../../utils/logger/logger.child';

const queuedLogger = workerLogger.child({
  queue: 'dealHandleQueue',
  helper: 'reminderDeal',
});

export const oneDayReminder = async (dealId: string) => {
  try {
    const _dealObjId = new Types.ObjectId(dealId);

    const deal = await DealModel.findOne({
      _id: _dealObjId,
      isBanned: { $ne: true }
    });

    if (!deal) {
      queuedLogger.info({ dealId, reminderType: 'oneDay' }, 'Deal not found');
      return;
    }

    await notifyUser({
      user: deal.user,
      title: 'Your deal will be expire soon!⏰',
      body: `"${deal.title}" will be expire tomorrow. Hurry up!`,
      type: NotificationType.REMINDER,
      webUrl: `${env.FRONTEND_URL}/deal-details/${deal._id}`,
      deepLink: `${env.DEEP_LINK}deal-details/${deal._id}`,
      entityId: deal._id.toString(),
      data: {
        dealId: deal._id.toString(),
        dealTitle: deal.title,
        dealDescription: deal.description,
      },
    });
  } catch (error: any) {
    queuedLogger.error({ error, dealId, reminderType: 'oneDay' }, 'One day reminder send error');
  }
};

export const oneHourReminder = async (dealId: string) => {
  try {
    const _dealObjId = new Types.ObjectId(dealId);

    const deal = await DealModel.findOne({
      _id: _dealObjId,
      isBanned: { $ne: true },
      deal_status: { $ne: 'BANNED' },
    });

    if (!deal) {
      queuedLogger.info({ dealId, reminderType: 'oneHour' }, 'Deal not found');
      return;
    }

    await notifyUser({
      user: deal.user,
      title: 'Your deal will be expire soon!⏰',
      body: `"${deal.title}" will be expire within an hour. Hurry up!`,
      type: NotificationType.REMINDER,
      webUrl: `${env.FRONTEND_URL}/deal-details/${deal._id}`,
      deepLink: `${env.DEEP_LINK}/deal-details/${deal._id}`,
      entityId: deal._id.toString(),
      data: {
        dealId: deal._id.toString(),
        dealTitle: deal.title,
        dealDescription: deal.description,
      },
    });
  } catch (error: any) {
    queuedLogger.error({ error, dealId, reminderType: 'oneHour' }, 'One hour reminder send error');
  }
};
