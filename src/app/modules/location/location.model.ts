import mongoose, { Schema } from 'mongoose';
import { ILocation } from './location.interface';

const normalizeLocationText = (value?: string) => value?.trim().toLowerCase();

const locationSchema = new Schema<ILocation>(
  {
    shop: { type: Schema.Types.ObjectId, ref: 'shop', required: true },
    location_name: { type: String, required: true, trim: true },
    address: {
      street: { type: String, trim: true },
      zip_code: { type: String, trim: true },
      city: { type: String, trim: true },
      state: { type: String, trim: true },
      country: { type: String, trim: true },
    },
    normalized: {
      city: { type: String, trim: true },
      state: { type: String, trim: true },
      country: { type: String, trim: true },
      zip_code: { type: String, trim: true },
    },
    location: {
      type: { type: String, enum: ['Point'], required: true },
      coordinates: {
        type: [Number], // [lng, lat]
        required: true,
        validate: {
          validator: (v: number[]) => Array.isArray(v) && v.length === 2,
          message: 'location.coordinates must be [lng, lat]',
        },
      },
    },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, versionKey: false }
);

locationSchema.pre('validate', function () {
  this.normalized = {
    city: normalizeLocationText(this.address?.city),
    state: normalizeLocationText(this.address?.state),
    country: normalizeLocationText(this.address?.country),
    zip_code: normalizeLocationText(this.address?.zip_code),
  };
});

//  Indexing
locationSchema.index({ location: '2dsphere' });

// Helpful for shop outlets listing
locationSchema.index({ shop: 1, isActive: 1 });
locationSchema.index({ isActive: 1 });

// Text search
locationSchema.index({ 'address.city': 1 });
locationSchema.index({ 'address.state': 1 });
locationSchema.index({ 'address.zip_code': 1 });
locationSchema.index({ 'address.country': 1 });
locationSchema.index({ location_name: 1 });
locationSchema.index({
  'normalized.city': 1,
  'normalized.state': 1,
  'normalized.country': 1,
});
locationSchema.index({ 'normalized.country': 1, 'normalized.state': 1 });
locationSchema.index({ 'normalized.zip_code': 1 });

export const Location = mongoose.model<ILocation>('location', locationSchema);
