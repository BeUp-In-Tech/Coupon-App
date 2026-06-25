/* eslint-disable @typescript-eslint/no-explicit-any */
import mongoose, { Schema } from 'mongoose';
import { IDeal } from './deal.interface';
import { addImageDeleteJob } from '../../utils/imageDeleteJobAdd';

const dealSchema = new Schema<IDeal>(
  {
    shop: {
      type: Schema.Types.ObjectId,
      ref: 'shop',
      required: true,
      index: true,
    },
    user: { type: Schema.Types.ObjectId, ref: 'user', required: true },

    category: {
      type: Schema.Types.ObjectId,
      ref: 'category',
      required: true,
      index: true,
    },
    activePromotion: {
      type: Schema.Types.ObjectId,
      ref: 'promotion',
      default: null,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      minLength: 2,
      maxLength: 120,
    },

    regular_price: { type: Number, required: true, min: 0 },
    discount: { type: Number, default: 0, min: 0, max: 100 }, // percent

    highlight: {
      type: [String],
      default: [],
      validate: {
        validator: (arr: string[]) => Array.isArray(arr) && arr.length <= 20,
        message: 'highlight cannot exceed 20 items',
      },
    },

    tags: {
      type: [String],
      default: [],
      validate: {
        validator: (arr: string[]) => Array.isArray(arr) && arr.length <= 20,
        message: 'tags cannot exceed 50 items',
      },
    },

    description: {
      type: String,
      required: true,
      trim: true,
      minlength: 10,
      maxLength: 5000,
    },

    images: {
      type: [String],
      required: true,
      validate: [
        {
          validator: (arr: string[]) =>
            Array.isArray(arr) && arr.length >= 1 && arr.length <= 15,
          message: 'images must contain 1 to 15 items',
        },
        {
          validator: (arr: string[]) =>
            arr.every(
              (u) =>
                typeof u === 'string' &&
                u.startsWith('https://') &&
                u.length <= 500
            ),
          message: 'each image must be a valid https url (max 500 chars)',
        },
      ],
    },

    nationwide: { type: Boolean, default: false },
    available_in_location: [
      { type: Schema.Types.ObjectId, ref: 'location', index: true },
    ],

    // Promotion (you included these)
    isPromoted: { type: Boolean, default: false, index: true },
    promotedUntil: { type: Date, default: new Date(), index: true },

    coupon: { type: String },
    coupon_option: {
      qr: { type: String },
      upc: { type: String },
    },
    isBanned: {
      type: Boolean,
      default: false,
      index: true,
    },
    ban_reason: { type: String, trim: true, maxLength: 500 },
    bannedAt: { type: Date },
    bannedBy: { type: Schema.Types.ObjectId, ref: 'user' },
    unbannedAt: { type: Date },
    unbannedBy: { type: Schema.Types.ObjectId, ref: 'user' },
  },
  { timestamps: true }
);


// IF ANY DUPLICATE ERROR DELETE IMAGES FROM STORAGE
dealSchema.post('save', async function (error: any, doc: IDeal, next: any) {
  if (error?.code === 11000 || error?.name === "ValidationError") {
    try {
      await Promise.all([
        doc?.images?.length ? addImageDeleteJob(doc.images) : null,
        doc?.coupon_option?.qr ? addImageDeleteJob([doc.coupon_option.qr]) : null,
        doc?.coupon_option?.upc ? addImageDeleteJob([doc.coupon_option.upc]) : null,
      ]);
    } catch (cleanupError) {
      // eslint-disable-next-line no-console
      console.error("Cloudinary cleanup failed:", cleanupError);
    }
  }

  next();
});

// Indexes you’ll use often
dealSchema.index({ shop: 1, category: 1 });
dealSchema.index({ category: 1, promotedUntil: -1 });
dealSchema.index({
  nationwide: 1,
  isPromoted: 1,
  promotedUntil: -1,
  isBanned: 1,
});

// make coupon codes unique per shop (only when exists)
dealSchema.index(
  { shop: 1, coupon: 1 },
  {
    unique: true,
    partialFilterExpression: { coupon: { $type: 'string' } },
  }
);

// TEXT SEARCH
dealSchema.index({
  title: 'text',
  description: 'text'
});

export const DealModel = mongoose.model<IDeal>('deal', dealSchema);
