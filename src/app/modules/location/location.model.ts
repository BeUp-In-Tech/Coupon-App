import mongoose, { Schema } from "mongoose";
import { ILocation } from "./location.interface";

const locationSchema = new Schema<ILocation>(
  {
    shop: { type: Schema.Types.ObjectId, ref: "shop", required: true },
    location_name: { type: String, required: true, trim: true},
    address: { 
      street: { type: String, trim: true },
      zip_code: { type: String, trim: true },
      city: { type: String, trim: true },
      state: { type: String, trim: true },
      country: { type: String, trim: true }
     },
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
  { timestamps: true, versionKey: false}
);

//  Indexing
locationSchema.index({ location: "2dsphere" });

// Helpful for shop outlets listing
locationSchema.index({ shop: 1, isActive: 1 });

// Text search
locationSchema.index({ 'address.city': 1 });
locationSchema.index({ 'address.state': 1 });
locationSchema.index({ 'address.zip_code': 1 });
locationSchema.index({ 'address.country': 1 });
locationSchema.index({  location_name: 1 });

export const Location = mongoose.model<ILocation>("location", locationSchema);