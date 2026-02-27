import { model, Schema } from 'mongoose';
import { Currency, IPlan } from './plan.interface';

const planScheam = new Schema<IPlan>(
  {
    title: { type: String, required: true, trim: true },
    short_desc: { type: String, required: true, trim: true },
    durationDays: { type: Number, require: true },
    icon: { type: String, required: true, trim: true },
    price: { type: Number, required: true, trim: true },
    currency: {
      type: String,
      enum: Object.keys(Currency),
      trim: true,
      uppercase: true,
      default: Currency.USD,
    },
  },
  {
    versionKey: false,
    timestamps: true,
  }
);

export const Plan = model<IPlan>('plan', planScheam);
