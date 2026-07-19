const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const { verifyToken, authorizeRoles } = require('../middleware/auth.middleware');
const { auditAction } = require('../middleware/audit');
const { billingCheckoutLimiter } = require('../middleware/rateLimiter');

router.get('/stats', verifyToken, authorizeRoles('Admin'), adminController.getStats);
router.get('/audit', verifyToken, authorizeRoles('Admin'), adminController.getAuditEvents);
router.get('/billing/overview', verifyToken, authorizeRoles('Admin'), adminController.getBillingOverview);
router.get('/billing/customers', verifyToken, authorizeRoles('Admin'), adminController.getBillingCustomers);
router.get('/billing/events', verifyToken, authorizeRoles('Admin'), adminController.getBillingEvents);
router.get('/billing/alerts', verifyToken, authorizeRoles('Admin'), adminController.getBillingAlerts);
router.post(
    '/billing/reconcile',
    verifyToken,
    authorizeRoles('Admin'),
    billingCheckoutLimiter,
    auditAction('billing.reconcile', 'BillingReconciliationRun'),
    adminController.runBillingReconciliation
);
router.post(
    '/billing/alerts/:id/resolve',
    verifyToken,
    authorizeRoles('Admin'),
    auditAction('billing.alert.resolve', 'BillingOperationalAlert'),
    adminController.resolveBillingAlert
);

module.exports = router;
