export enum Role {
    USER = "USER",
    VENDOR = "VENDOR",
    ADMIN = "ADMIN"
}

export interface IAuthProvider {
    provider: "credentials" | "google" | "apple",
    providerId: string;
}

export enum IsActiveUser {
    ACTIVE = "ACTIVE",
    INACTIVE = "INACTIVE",
    BLOCKED = "BLOCKED"
}

export interface IUser {
    _id: string;
    user_name: string;
    email: string;
    password?: string;
    isVerified?: boolean;
    isDeleted?: boolean;
    isActive?: IsActiveUser;
    role?: Role;
    auths?: IAuthProvider[]
}