/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-console */
import { deleteImageFromCLoudinary } from "../config/cloudinary.config"


export const asynSingleImageDelete = async (image: string) => {
    setImmediate(async () =>  {
        try {
            await deleteImageFromCLoudinary(image);
        } catch (error: any) {
            console.log("Cloudinary image delete error: ", error.message);
        }
    })
}