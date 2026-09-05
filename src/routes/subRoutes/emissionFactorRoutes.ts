import express from "express";
import multer from "multer";
import * as Controller from "../../controller/emissionFactorController.js";
import * as authService from "../../middleware/authService.js";

const Routes = express.Router();

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB cap (BAFU 2025 CSV ~11k rows ≈ 5 MB)
});

// List + filter + paginate the emission_factors master table.
Routes.get(
    "/api/emission-factors/list",
    authService.authenticate,
    Controller.listEmissionFactors
);

// Fetch a single emission factor by ef_id.
Routes.get(
    "/api/emission-factors/:ef_id",
    authService.authenticate,
    Controller.getEmissionFactorById
);

// Summary stats (total rows, distinct sources/countries) for Settings card.
Routes.get(
    "/api/emission-factors/meta/stats",
    authService.authenticate,
    Controller.getEmissionFactorStats
);

// Cascading EF taxonomy for the supplier-questionnaire dropdowns
// (category → sub_category → group → specific_type). Unauthenticated, like the
// other supplier-questionnaire endpoints (the supplier opens it via a link).
Routes.get(
    "/api/emission-factors/meta/taxonomy",
    Controller.getEfTaxonomy
);

// Replace-all CSV import. Super admin only. Field name in form-data: "file".
Routes.post(
    "/api/emission-factors/import-csv",
    authService.authenticate,
    upload.single("file"),
    Controller.importEmissionFactorsCsv
);

export default Routes;
