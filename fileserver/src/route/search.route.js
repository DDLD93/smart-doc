'use strict';

const express = require('express');
const ctrl = require('../controller/search.controller');

const router = express.Router();

router.post('/documents',    (req, res) => ctrl.searchDocuments(req, res));
router.post('/doctor-notes', (req, res) => ctrl.searchDoctorNotes(req, res));

module.exports = router;
