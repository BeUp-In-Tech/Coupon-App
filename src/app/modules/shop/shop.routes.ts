import { Router } from "express";
import { shopController } from "./shop.controllers";
import { validateRequest } from "../../middlewares/validateRequest";
import { shopValidationSchema } from "./shop.validate";
import { checkAuth } from "../../middlewares/auth.middleware";
import { Role } from "../user/user.interface";


const router = Router();

router.post('/cerate_shop', validateRequest(shopValidationSchema), checkAuth(Role.VENDOR),  shopController.createShop);


export const shopRouter =  router;