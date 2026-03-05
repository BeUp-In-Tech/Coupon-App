import { model, Schema } from 'mongoose';
import { IShop, ShopApproval } from './shop.interface';

const ShopSchema = new Schema<IShop>(
  {
    vendor: {
      type: Schema.Types.ObjectId,
      ref: 'user',
      required: true,
    },
    business_name: {
      type: String,
      required: true,
      trim: true,
    },
    business_email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    business_phone: {
      country_code: {type: String, require: true, trim: true },
      phone_number: {type: String, require: true, trim: true },
    },
    business_logo: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    shop_approval: {
      type: String,
      enum: Object.values(ShopApproval),
      default: ShopApproval.PENDING,
    },
    website: {
      type: String,
    },
  },
  { timestamps: true }
);

 

export const Shop = model<IShop>('shop', ShopSchema);
