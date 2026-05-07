'use strict';

const express = require('express');
const ctrl = require('../../controller/agent/sql.controller');

const router = express.Router();

router.get('/schema', (req, res) => ctrl.getSchema(req, res));
router.post('/query', (req, res) => ctrl.runQuery(req, res));

module.exports = router;
