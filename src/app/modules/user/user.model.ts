import mongoose from 'mongoose';
import { IAuthProvider, IFcmToken, IPlatform, IsActiveUser, IUser, Role } from './user.interface';
import bcrypt from 'bcrypt';
import env from '../../config/env';


// AUTH SUB-SCHEMA
const authProviderSchema = new mongoose.Schema<IAuthProvider>({
    provider: { type: String, required: true },
    providerId: { type: String, required: true }
}, {
    _id: false,
    versionKey: false
});

// TOKEN SUB-SCHEMA
const DeviceTokenSchema = new mongoose.Schema<IFcmToken>(
  {
    deviceId: { type: String, required: true }, // stable per install/browser
    platform: { type: String, enum: IPlatform, required: true },
    token: { type: String, required: true }, // FCM token

    deviceName: { type: String, default: "" },
    lastSeenAt: { type: Date, default: Date.now },

    isActive: { type: Boolean, default: true },
  },
  { _id: false }
);



// MAIN USER SCHEMA
const userSchema = new mongoose.Schema<IUser>({
    user_name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase:true },
    password: { type: String },
    isVerified: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },
    deviceTokens: {type: [DeviceTokenSchema], default: []},
    isActive: { type: String, enum: [...Object.keys(IsActiveUser)] , default: IsActiveUser.ACTIVE },
    role: { type: String, enum: [...Object.values(Role)], default: Role.VENDOR },
    auths: [authProviderSchema]
}, {
    versionKey: false,
    timestamps: true
});


// Hashed password
//  userSchema.pre('save', async function () {
//   if (!this.password) return;  
//     const hashedPassword = await bcrypt.hash(
//       this.password,
//       parseInt(env.BCRYPT_SALT_ROUND)
//     );
//     this.password = hashedPassword;
// });

// Hashed password
userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;  // Only hash the password if it has been modified
  
  if (this.password) {
    const hashedPassword = await bcrypt.hash(
      this.password,
      parseInt(env.BCRYPT_SALT_ROUND)
    );
    this.password = hashedPassword;
  }
});




const User = mongoose.model<IUser>("user", userSchema);
export default User;