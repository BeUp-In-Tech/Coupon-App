import mongoose, { Schema} from "mongoose";


const ServiceSchema = new Schema(
  {
    shop: { type: Schema.Types.ObjectId, ref: "shop", required: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: "user", required: true },

    category: { type: Schema.Types.ObjectId, ref: "categories", required: true, index: true },
    activePromotion: { type: Schema.Types.ObjectId, ref: "promotion", default: null },

    title: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },

    reguler_price: { type: Number, required: true, min: 0 },
    discount: { type: Number, default: 0, min: 0, max: 100 }, // percent

    highlight: {
      type: [String],
      default: [],
      validate: {
        validator: (arr: string[]) => Array.isArray(arr) && arr.length <= 20,
        message: "highlight cannot exceed 20 items",
      },
    },

    description: { type: String, required: true, trim: true, minlength: 10, maxlength: 5000 },

    images: {
      type: [String],
      required: true,
      validate: [
        {
          validator: (arr: string[]) => Array.isArray(arr) && arr.length >= 1 && arr.length <= 15,
          message: "images must contain 1 to 15 items",
        },
        {
          validator: (arr: string[]) => arr.every((u) => typeof u === "string" && u.startsWith("https://") && u.length <= 500),
          message: "each image must be a valid https url (max 500 chars)",
        },
      ],
    },

    // Promotion (you included these)
    isPromoted: { type: Boolean, default: false, index: true },
    promotedUntil: { type: Date, default: null, index: true },

    coupon: { type: String  },

    total_views: { type: Number, default: 0, min: 0 },
    total_impression: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

// Indexes you’ll use often
ServiceSchema.index({ shop: 1, category: 1 });
ServiceSchema.index({ category: 1, promotedUntil: -1 });

// Optional: make coupon codes unique per shop (only when exists)
ServiceSchema.index(
  { shop: 1, "coupon.coupon_code": 1 },
  {
    unique: true,
    partialFilterExpression: { "coupon.coupon_code": { $type: "string" } },
  }
);


export const ServiceModel = mongoose.model("service", ServiceSchema);