/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-console */
import { Types } from 'mongoose';
import { DealModel } from './../../modules/deal/deal.model';
import { notifyUser } from '../../utils/notification/push.notification';
import { NotificationType } from '../../modules/notification/notification.interface';
import env from '../../config/env';

export const oneDayReminder = async (dealId: string) => {
  try {
    const _dealObjId = new Types.ObjectId(dealId);

    const deal = await DealModel.findById(_dealObjId);

    if (!deal) {
      console.log('Deal not found');
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
    console.log(`One day reminder send error: `, error.message);
  }
};

export const oneHourReminder = async (dealId: string) => {
  try {
    const _dealObjId = new Types.ObjectId(dealId);

    const deal = await DealModel.findById(_dealObjId);

    if (!deal) {
      console.log('Deal not found');
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
    console.log('One hour Reminder send error: ', error.message);
  }
};
