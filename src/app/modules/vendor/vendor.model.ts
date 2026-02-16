import mongoose from 'mongoose';
import { IAuthProvider, IVendor, Role } from './vendor.interface';
import bcrypt from 'bcrypt';
import env from '../../config/env';


const authProviderSchema = new mongoose.Schema<IAuthProvider>({
    provider: { type: String, required: true },
    providerId: { type: String, required: true }
}, {
    _id: false,
    versionKey: false
});



const userSchema = new mongoose.Schema<IVendor>({
    user_name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase:true },
    password: { type: String },
    isVerified: { type: Boolean, default: false },
    role: { type: String, enum: [...Object.values(Role)], default: Role.VENDOR },
    auths: [authProviderSchema]
}, {
    versionKey: false,
    timestamps: true
});


// Hashed password
 userSchema.pre('save', async function () {
  if (!this.password) return;  
    const hashedPassword = await bcrypt.hash(
      this.password,
      parseInt(env.BCRYPT_SALT_ROUND)
    );
    this.password = hashedPassword;
});




const Vendor = mongoose.model<IVendor>("vendor", userSchema);
export default Vendor;