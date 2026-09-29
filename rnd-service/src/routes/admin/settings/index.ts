import { Router } from 'express';
import storageRoutes from './storage.routes';
import backupsRoutes from './backups.routes';
import phoneVerificationRoutes from './phoneVerification.routes';
import adminAccountsRoutes from './adminAccounts.routes';
import systemConfigRoutes from './systemConfig.routes';
import rolesRoutes from './roles.routes';
import auditLogsRoutes from './auditLogs.routes';
import sessionsRoutes from './sessions.routes';
import systemAdminRoutes from './systemAdmin.routes';
import permissionsPBACRoutes from './permissionsPBAC.routes';
import whatsappInsightsRoutes from './whatsappInsights.routes';

const router = Router();

router.use('/', storageRoutes);
router.use('/', backupsRoutes);
router.use('/', phoneVerificationRoutes);
router.use('/', adminAccountsRoutes);
router.use('/', systemConfigRoutes);
router.use('/', rolesRoutes);
router.use('/', auditLogsRoutes);
router.use('/', sessionsRoutes);
router.use('/', systemAdminRoutes);
router.use('/', permissionsPBACRoutes);
router.use('/', whatsappInsightsRoutes);

export default router;
