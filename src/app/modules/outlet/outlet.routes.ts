import { Router } from "express";
import { validateRequest } from "../../middlewares/validateRequest";
import { outletUpdateZodSchema } from "./outlet.validate";
import { checkAuth } from "../../middlewares/auth.middleware";
import { Role } from "../user/user.interface";
import { outletControllers } from "./outlet.controller";

const router = Router();

// UPDATE OUTLET
router.patch('/', validateRequest(outletUpdateZodSchema), checkAuth(...Object.keys(Role)), outletControllers.updateOutlet);

export const outletRouter = router;