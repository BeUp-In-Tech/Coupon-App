import mongoose, { Schema } from "mongoose";
import { IOutlet } from "./outlet.interface";

const OutletSchema = new Schema<IOutlet>(
  {
    shop: { type: Schema.Types.ObjectId, ref: "shop", required: true },
    address: { type: String, required: true, trim: true },

    location: {
      type: { type: String, enum: ["Point"], required: true },
      coordinates: {
        type: [Number], // [lng, lat]
        required: true,
        validate: {
          validator: (v: number[]) => Array.isArray(v) && v.length === 2,
          message: "location.coordinates must be [lng, lat]",
        },
      },
    },

    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

//  Indexing
OutletSchema.index({ location: "2dsphere" });

// Helpful for shop outlets listing
OutletSchema.index({ shopId: 1, isActive: 1 });

export const OutletModel = mongoose.model<IOutlet>("Outlet", OutletSchema);