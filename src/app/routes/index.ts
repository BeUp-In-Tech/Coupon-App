import { Router } from 'express';
import { authRouter } from '../modules/auth/auth.routes';
import { vendorRoutes } from '../modules/user/user.routes';
import { shopRouter } from '../modules/shop/shop.routes';
import { categoryRouter } from '../modules/categories/categories.routes';
import { locationRouter } from '../modules/location/location.routes';
import { serviceRouter } from '../modules/deal/deal.routes';
import { planRouter } from '../modules/plan/plan.routes';
import { voucherRouter } from '../modules/voucher/voucher.routes';
import { paymentRouter } from '../modules/payment/payment.routes';
import { NotificationRouter } from '../modules/notification/notification.route';
import { dashboardRouter } from '../modules/dashboard/dashboard.routes';
import { StaticPageRoutes } from '../modules/staticContent/static.route';
import { migrationRouter } from '../modules/migrations/location.migration';

export const router = Router();

const moduleRoutes = [
   {
    path: '/auth',
    route: authRouter
   },
   {
    path: '/user',
    route: vendorRoutes
   },
   {
    path: '/shop',
    route: shopRouter
   },
   {
    path: '/category',
    route: categoryRouter
   }, 
   {
    path: '/locations',
    route: locationRouter
   }, 
   {
    path: '/service',
    route: serviceRouter
   }, 
   {
    path: '/plan',
    route: planRouter
   }, 
   {
    path: '/voucher',
    route: voucherRouter
   }, 
   {
    path: '/payment',
    route: paymentRouter
   }, 
   {
    path: '/notification',
    route: NotificationRouter
   }, 
   {
    path: '/dashboard',
    route: dashboardRouter
   }, 
   {
    path: '/static',
    route: StaticPageRoutes
   }, 
   {
    path: '/migrations',
    route: migrationRouter
   }, 
];

moduleRoutes.forEach((r) => {
  router.use(r.path, r.route);
});
