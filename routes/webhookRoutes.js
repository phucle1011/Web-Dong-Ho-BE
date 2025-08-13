const express = require('express');
const router = express.Router();
const WebhookController = require('../controllers/Client/ordersController');

router.post(
  '/',
  express.raw({ type: 'application/json' }),
  (req, res, next) => {
    req.rawBody = req.body.toString('utf8');
    next();
  },
  WebhookController.handleWebhook
);

module.exports = router;