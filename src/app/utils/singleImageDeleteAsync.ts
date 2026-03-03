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


export const asynMultipleImageDelete = async (images: string[]) => {
    setImmediate(async () =>  {
        try {
             images.forEach(async (iamge) => {
                await deleteImageFromCLoudinary(iamge);
             })
        } catch (error: any) {
            console.log("Cloudinary image delete error: ", error.message);
        }
    })
}