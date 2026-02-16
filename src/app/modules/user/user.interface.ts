export enum Role {
    USER = "USER",
    VENDOR = "VENDOR",
    ADMIN = "ADMIN"
}

export interface IAuthProvider {
    provider: "credentials" | "google" | "apple",
    providerId: string;
}

export interface IVendor {
    _id: string;
    user_name: string;
    email: string;
    password?: string;
    isVerified?: boolean;
    role?: Role;
    auths?: IAuthProvider[]
}