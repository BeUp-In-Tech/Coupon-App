import mongoose from 'mongoose';
import { IAuthProvider, IsActiveUser, IUser, Role } from './user.interface';
import bcrypt from 'bcrypt';
import env from '../../config/env';


const authProviderSchema = new mongoose.Schema<IAuthProvider>({
    provider: { type: String, required: true },
    providerId: { type: String, required: true }
}, {
    _id: false,
    versionKey: false
});



const userSchema = new mongoose.Schema<IUser>({
    user_name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase:true },
    password: { type: String },
    isVerified: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },
    isActive: { type: String, enum: [...Object.keys(IsActiveUser)] , default: IsActiveUser.ACTIVE },
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




const User = mongoose.model<IUser>("user", userSchema);
export default User;