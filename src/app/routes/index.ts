import { Router } from 'express';
import { authRouter } from '../modules/auth/auth.routes';
import { vendorRoutes } from '../modules/user/user.routes';
import { shopRouter } from '../modules/shop/shop.routes';
import { categoryRouter } from '../modules/categories/categories.routes';
import { outletRouter } from '../modules/outlet/outlet.routes';
import { serviceRouter } from '../modules/service/service.routes';
import { planRouter } from '../modules/plan/plan.routes';

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
];

moduleRoutes.forEach((r) => {
  router.use(r.path, r.route);
});
