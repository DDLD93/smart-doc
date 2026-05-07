'use strict';

const express = require('express');
const ctrl = require('../../controller/agent/rag.controller');

const router = express.Router();

router.post('/search-documents', (req, res) => ctrl.searchDocuments(req, res));
router.post('/search-doctor-notes', (req, res) => ctrl.searchDoctorNotes(req, res));

module.exports = router;
