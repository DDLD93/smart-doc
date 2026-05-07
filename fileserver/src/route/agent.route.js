'use strict';

const express = require('express');

const router = express.Router();

router.use('/rag', require('./agent/rag.route'));
router.use('/patients', require('./agent/patient.route').patientRouter);
router.use('/encounters', require('./agent/patient.route').encounterRouter);
router.use('/sql', require('./agent/sql.route'));

const toolsController = require('../controller/agent/tools.controller');
router.get('/tools', (req, res) => toolsController.list(req, res));
router.get('/health', (req, res) => toolsController.health(req, res));

module.exports = router;
