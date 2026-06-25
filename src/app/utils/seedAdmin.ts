import env from "../config/env";
import { IUser, Role } from "../modules/user/user.interface";
import User from "../modules/user/user.model";
import { logger } from "./logger/logger.config";


export const createAdmin = async () => {
    try {
        const isExist = await User.findOne({email: env.ADMIN_MAIL });
        if (isExist) {
             logger.info("Admin already created");
             return    
        }
        
        const adminPayload: IUser = {
            user_name: "Yepp Admin",
            email: env.ADMIN_MAIL,
            role: Role.ADMIN,
            isVerified: true,
            deviceTokens: [],
            password: env.ADMIN_PASSWORD
        }

    await User.create(adminPayload);
    logger.info("Admin created");
    
    } catch (error) {
        logger.error({error}, 'Seed admin error');
    }
}