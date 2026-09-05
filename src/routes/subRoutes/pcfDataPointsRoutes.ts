import { Router } from "express";
import * as Controller from "../../controller/pcfDataPointsController.js";
import * as authService from "../../middleware/authService.js";

const Routes = Router();

// Per-component Catena-X PCF v3.0.0 data points (values) for a PCF request.
// Available after "Run PCF Calculation" has produced computed fields.
Routes.get(
    "/api/pcf-request/:bomPcfId/component/:componentId/pcf-data-points",
    authService.authenticate,
    Controller.getDataPointsHandler
);

// Same data points as a downloadable per-component PDF.
Routes.get(
    "/api/pcf-request/:bomPcfId/component/:componentId/pcf-data-points/pdf",
    authService.authenticate,
    Controller.getDataPointsPdfHandler
);

export default Routes;
