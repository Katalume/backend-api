const express = require('express');
const controller = require('../controllers/billing.controller');
const { verifyToken } = require('../middleware/auth.middleware');
const { billingCheckoutLimiter, billingWebhookLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

router.get('/offers', controller.offers);
router.get('/summary', verifyToken, controller.summary);
router.get('/receipts', verifyToken, controller.receipts);
router.get('/receipts/:id', verifyToken, controller.receipt);
router.post('/checkouts', verifyToken, billingCheckoutLimiter, controller.checkout);
router.post('/subscriptions/:id/cancel', verifyToken, billingCheckoutLimiter, controller.cancel);
router.post('/webhooks/cashfree', billingWebhookLimiter, controller.cashfreeWebhook);

module.exports = router;
