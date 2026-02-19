import { Router } from 'express';
import { authRouter } from '../modules/auth/auth.routes';
import { vendorRoutes } from '../modules/user/user.routes';
import { shopRouter } from '../modules/shop/shop.routes';



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
   }
];

moduleRoutes.forEach((r) => {
  router.use(r.path, r.route);
});
