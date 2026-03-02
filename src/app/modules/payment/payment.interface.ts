import { Types } from "mongoose";

export enum PaymentProvider {
    STRIPE = 'STRIPE',
    GOOGLE_PAY = 'GOOGLE_PAY',
    APPLE_PAY = 'APPLE_PAY'
}

export enum PaymentStatus {
    PAID = 'PAID',
    PENDING = 'PENDING',
    FAILED = 'FAILED',
    CANCELED = 'CANCELED'
}

export interface IPayment {
    _id?: Types.ObjectId;
    user: Types.ObjectId;
    service: Types.ObjectId;
    promotion?: Types.ObjectId;
    transaction_id: string;
    amount: number;
    voucher_applied?: string | null;
    payment_geteway_charge?: number;
    currency?: string;
    provider: PaymentProvider;
    payment_status: PaymentStatus;
    invoice_url?: string;
    stripe_session_id?: string;
    payment_intent_id?: string;
}