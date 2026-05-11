import { Router } from 'express';
import { authRouter } from '../modules/auth/auth.routes';
import { vendorRoutes } from '../modules/user/user.routes';
import { shopRouter } from '../modules/shop/shop.routes';
import { categoryRouter } from '../modules/categories/categories.routes';
import { outletRouter } from '../modules/outlet/outlet.routes';
import { serviceRouter } from '../modules/deal/deal.routes';
import { planRouter } from '../modules/plan/plan.routes';
import { voucherRouter } from '../modules/voucher/voucher.routes';
import { paymentRouter } from '../modules/payment/payment.routes';
import { NotificationRouter } from '../modules/notification/notification.route';
import { dashboardRouter } from '../modules/dashboard/dashboard.routes';
import { StaticPageRoutes } from '../modules/staticContent/static.route';

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
    path: '/outlet',
    route: outletRouter
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
];

moduleRoutes.forEach((r) => {
  router.use(r.path, r.route);
});
