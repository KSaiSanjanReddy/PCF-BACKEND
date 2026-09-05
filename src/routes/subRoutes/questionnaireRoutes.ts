import { Router } from "express";
import * as Controller from "../../controller/questionnaireController.js";
import * as authService from "../../middleware/authService.js";

const Routes = Router();

// Save / upsert a questionnaire response (draft or submitted).
Routes.post("/api/questionnaire/save", authService.authenticate, Controller.saveHandler);

// The current supplier's own response (id + status + form snapshot) for a PCF
// request — used to reload the form when the supplier reopens it.
Routes.get(
    "/api/questionnaire/mine/:bomPcfRequestId",
    authService.authenticate,
    Controller.getMineHandler
);

// Load one response.
Routes.get("/api/questionnaire/:responseId", authService.authenticate, Controller.loadHandler);

// List all supplier responses linked to a PCF request (super admin only).
Routes.get(
    "/api/questionnaire/by-pcf/:bomPcfRequestId",
    authService.authenticate,
    Controller.listByPcfHandler
);

// Submit (validate mandatory + run formula engine).
Routes.post(
    "/api/questionnaire/submit/:responseId",
    authService.authenticate,
    Controller.submitHandler
);

// Assemble v9 JSON + push to Quintari (super admin only).
Routes.post(
    "/api/questionnaire/publish/:responseId",
    authService.authenticate,
    Controller.publishHandler
);

// Render branded PDF of the supplier questionnaire.
Routes.post("/api/questionnaire/pdf", authService.authenticate, Controller.pdfHandler);

export default Routes;
