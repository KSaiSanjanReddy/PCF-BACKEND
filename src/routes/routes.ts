
import userRoutes from './subRoutes/userRoutes.js';
import roleAndDeptRoutes from './subRoutes/roleAndDepartmentRoutes.js';
import dataSetupRoutes from './subRoutes/dataSetupRoutes.js';
import ownEmissionRoutes from './subRoutes/ownEmissionRoutes.js';
import documentMasterRoutes from './subRoutes/documentMasterRoutes.js';
import bomRoutes from './subRoutes/bomRoutes.js';
import taskManagementRoutes from './subRoutes/taskManagementRoutes.js';
import supplierInputQuestions from './subRoutes/supplierInputQuestionRoutes.js';
import dqrRating from './subRoutes/dqrRatingRoutes.js';
import supplierDetails from './subRoutes/supplierInfoRoutes.js';
import product from './subRoutes/productRoutes.js';
import imageRoutes from './subRoutes/imageRoutes.js';
import masterDatasetup from './subRoutes/materDataSetupRoutes.js';
import emissionFactor from './subRoutes/emissionFactorRoutes.js';
import componentMaster from './subRoutes/componentMasterRoutes.js';
import reports from './subRoutes/reportsRoutes.js';
import dashboard from './subRoutes/dashboardRoutes.js';
import notification from './subRoutes/notification.routes.js';
import aiChat from './subRoutes/aiChatRoutes.js';
import quintari from './subRoutes/quintariRoutes.js';
import questionnaire from './subRoutes/questionnaireRoutes.js';
import pcfDataPoints from './subRoutes/pcfDataPointsRoutes.js';



export function routes(app: any) {

    app.use(userRoutes);
    app.use(roleAndDeptRoutes);
    app.use(dataSetupRoutes);
    app.use(ownEmissionRoutes);
    app.use(documentMasterRoutes);
    app.use(bomRoutes);
    app.use(taskManagementRoutes);
    app.use(supplierInputQuestions);
    app.use(dqrRating);
    app.use(supplierDetails);
    app.use(product);
    app.use(imageRoutes);
    app.use(masterDatasetup);
    app.use(emissionFactor);
    app.use(componentMaster);
    app.use(reports);
    app.use(dashboard);
    app.use(notification);
    app.use(aiChat);
    app.use(quintari);
    app.use(questionnaire);
    app.use(pcfDataPoints);
    app.get('/health', (_req: any, res: any) => {
        res.send('ok');
    });

}
