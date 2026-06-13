import mongoose, { Schema } from "mongoose";
import { IOutlet } from "./location.interface";

const locationSchema = new Schema<IOutlet>(
  {
    shop: { type: Schema.Types.ObjectId, ref: "shop", required: true },

    address: { type: String, required: true, trim: true },
    location_name: { type: String, required: true, trim: true},
    zip_code: { type: String, required: true, trim: true},
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

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

//  Indexing
locationSchema.index({ location: "2dsphere" });

// Helpful for shop outlets listing
locationSchema.index({ shop: 1, isActive: 1 });

export const Location = mongoose.model<IOutlet>("Outlet", locationSchema);