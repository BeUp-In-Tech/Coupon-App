/* eslint-disable @typescript-eslint/no-unused-vars */
import { NextFunction, Request, Response } from "express";
import { CatchAsync } from "../../../utils/CatchAsync";
import { SendResponse } from "../../../utils/SendResponse";
import { StatusCodes } from "http-status-codes";
import { dealsServices } from "./deal.service";
import { JwtPayload } from "jsonwebtoken";
import { SearchDealsByLocationQuerySchema } from "../deal.validate";
import { dealLogger } from "../../../utils/logger/logger.child";


export interface MulterRequest extends Request {
  files: {
    qr?: Express.Multer.File[];
    upc?: Express.Multer.File[];
    files?: Express.Multer.File[];
  };
}


// CREATE SHOP
const createDeals = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user as JwtPayload;
    const payload = req.body;
    const result = await dealsServices.createDealsService({ user, payload });

    SendResponse(res, {
        success: true,
        statusCode: StatusCodes.CREATED,
        message: "Service created",
        trace_id: req.id as string,
        data: result
    })
});

// VIEW DEAL
const getSingleDeals = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const dealId = req.params.dealId as string;
    const lng = Number(req.params.lng);
    const lat =  Number( req.params.lat );

    const result = await dealsServices.getSingleDealsService( dealId, lat, lng );

    SendResponse(res, {
        success: true,
        statusCode: StatusCodes.OK,
        message: "Service fetched",
        trace_id: req.id as string,
        data: result
    })
});

// DELETE SHOP
const deleteDeals = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user as JwtPayload;
    const serviceId = req.params.dealId as string;

    const result = await dealsServices.deleteDealsService( user, serviceId );

    SendResponse(res, {
        success: true,
        statusCode: StatusCodes.OK,
        message: "Service deleted",
        trace_id: req.id as string,
        data: result
    })
});

// DELETE SHOP
const updateSingleDeals = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user as JwtPayload;
    const serviceId = req.params.dealId as string;
    
    const result = await dealsServices.updateDealsService( user, serviceId, req.body);

    SendResponse(res, {
        success: true,
        statusCode: StatusCodes.OK,
        message: "Service updated",
        trace_id: req.id as string,
        data: result
    })
});

// DELETE SHOP
const getMyDeals = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user as JwtPayload;
    const query = req.query as Record<string, string>;
    const result = await dealsServices.getMyDealsService( user.userId, query );

    SendResponse(res, {
        success: true,
        statusCode: StatusCodes.OK,
        message: "Fetched deals",
        trace_id: req.id as string,
        data: result
    })
});

// GET NEAREST DEALS
const getNearestDeals = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const query = req.query as Record<string, string>;
    const lng = Number(req.params.lng) as number;
    const lat = Number(req.params.lat) as number;
    const result = await dealsServices.getNearestDealsService(lng, lat, query);

    SendResponse(res, {
        success: true,
        statusCode: StatusCodes.OK,
        message: "Fetched all deals",
        trace_id: req.id as string,
        data: result
    })
});

// GET ALL DEALS
const getAllDeals = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const query = req.query as Record<string, string>;
    const lng = Number(req.params.lng);
    const lat = Number(req.params.lat);
    
    const result = await dealsServices.getAllDealsService(lng, lat, query);

    SendResponse(res, {
        success: true,
        statusCode: StatusCodes.OK,
        message: "All deals fetched",
        trace_id: req.id as string,
        data: result
    })
})

/**
 * Assembles HATEOAS hypermedia links for paginated deal search responses.
 *
 * - `self`  — always present; mirrors the current request URL exactly.
 * - `next`  — present only when more pages follow (meta.page < meta.totalPages).
 * - `prev`  — present only when not on the first page (meta.page > 1).
 *
 * Link construction delegates to the Node.js URL API so that existing query
 * parameters are preserved and only `page` is overridden (REQ 3.4).
 */
function buildHateoasLinks(
    req: Request,
    meta: { page: number; totalPages: number }
): { self: string; next?: string; prev?: string } {
    const base = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

    const links: { self: string; next?: string; prev?: string } = {
        self: base,
    };

    if (meta.page < meta.totalPages) {
        const nextUrl = new URL(base);
        nextUrl.searchParams.set('page', String(meta.page + 1));
        links.next = nextUrl.toString();
    }

    if (meta.page > 1) {
        const prevUrl = new URL(base);
        prevUrl.searchParams.set('page', String(meta.page - 1));
        links.prev = prevUrl.toString();
    }

    return links;
}

// SEARCH DEALS BY ACTIVE LOCATION MODE
const searchDealsByLocation = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const query = await SearchDealsByLocationQuerySchema.parseAsync(req.query);
    const result = await dealsServices.searchDealsByLocationService(query);

    // Set http headers
    res.setHeader('Cache-Control', 'public, max-age=60 stale-while-revalidate=120');
    res.setHeader('Expires', new Date(Date.now() + 60 * 1000).toUTCString());

    SendResponse(res, {
        success: true,
        statusCode: StatusCodes.OK,
        message: "Deals fetched by location",
        trace_id: req.id as string,
        data: result
    })
})

// GET USERS SAVED DEALS
const getDealsByIds = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const idString = req.query.ids as string;
    const ids = idString.split(",");
    const query = req.query as Record<string, string>;
    
    const result = await dealsServices.getDealsByIdsService(ids, query);

    SendResponse(res, {
        success: true,
        statusCode: StatusCodes.OK,
        message: "Save deals fetched",
        trace_id: req.id as string,
        data: result
    })
})

// GET DEALS BY CATEGORY
const getDealsByCategory = CatchAsync(async  (req: Request, res: Response, next: NextFunction) => {
    const categoryId = req.params.categoryId as string;
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const query = req.query as Record<string, string>;

    const result = await dealsServices.getDealsByCategoryService(lng, lat, categoryId, query);

    SendResponse(res, {
        success: true,
        statusCode:StatusCodes.OK,
        message: "Category deals fetched",
        trace_id: req.id as string,
        data: result
    })
})

// GET TOP VIEWED DEALS
const topViewedDeals = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user as JwtPayload;
    const query = req.query as Record<string,string>;
    const result = await dealsServices.topViewedDealsService(user, query);

    SendResponse(res, {
        success: true,
        statusCode: StatusCodes.OK,
        message: "Top deals fetched",
        trace_id: req.id as string,
        data: result
    })
})


// GET DEAL ANALYTICS
const dealAnalytics = CatchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user as JwtPayload;
    const { dealId } = req.params as Record<string,string>;
    const result = await dealsServices.dealAnalyticsService(user.userId, dealId);

    SendResponse(res, {
        success: true,
        statusCode: StatusCodes.OK,
        message: "Deal analytics fetched",
        trace_id: req.id as string,
        data: result
    })
})



export const dealsControllers = {
    createDeals,
    getSingleDeals,
    deleteDeals,
    updateSingleDeals,
    getMyDeals,
    getNearestDeals,
    getDealsByCategory,
    getAllDeals,
    getDealsByIds,
    topViewedDeals,
    dealAnalytics,
    searchDealsByLocation
}
