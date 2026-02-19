import { model, Schema } from 'mongoose';
import { IShop, LocationType, ShopApproval } from './shop.interface';

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
    location: {
      type: {
        type: String,
        enum: [...Object.values(LocationType)],
        required: true,
      },
    },
    zip_code: {
      type: String,
      required: true,
    },
    website: {
      type: String,
    },
  },
  { timestamps: true }
);

export const Shop = model<IShop>('shop', ShopSchema);
