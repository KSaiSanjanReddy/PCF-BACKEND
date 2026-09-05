import { Router } from 'express';
import * as Controller from '../../controller/supplierInputQuestionController.js';
import * as  authService from '../../middleware/authService.js'
const Routes = Router();

// Legacy 70-question write endpoints have been removed — the V3 (28-question)
// questionnaire writes via /api/questionnaire/{save,submit,publish,pdf}.
// Read endpoints + utilities below stay mounted (DQR, archived list, V3 form
// BOM auto-populate, geocoding, distance, maintenance scripts).
Routes.get('/api/supplier-input-questions-list', authService.authenticate, Controller.getSupplierDetailsList);
Routes.get('/api/supplier-input-questions-get-by-id', authService.authenticate, Controller.getSupplierDetailsById);
Routes.get('/api/questionnaire-ids-for-patch', authService.authenticate, Controller.getQuestionnaireIdsForPatch);
Routes.post('/api/patch-bom-id-transport-waste', authService.authenticate, Controller.patchBomIdOnTransportAndWaste);
Routes.post('/api/delete-null-bom-id-transport-records', authService.authenticate, Controller.deleteNullBomIdTransportRecords);
Routes.post('/api/delete-q52-material', authService.authenticate, Controller.deleteQ52Material);
Routes.post('/api/delete-q52-material-by-name', authService.authenticate, Controller.deleteQ52MaterialByName);
Routes.get('/api/supplier/material-composition-metal-dropdown', authService.authenticate, Controller.getMaterialCompositionMetal);
Routes.get('/api/supplier/material-composition-metal-type-dropdown', authService.authenticate, Controller.getMaterialCompositionMetalType);
Routes.get('/api/supplier/auto-populate-bom-details', Controller.getPCFBOMListToAutoPop);
Routes.post('/api/supplier/update-data-collection-question-stage', Controller.updatePcfBomSupplierQuestionClickedStatus);
Routes.get('/api/geocode-search', Controller.geocodeSearch);
Routes.post('/api/calculate-distance', Controller.calculateDistance);

export default Routes;