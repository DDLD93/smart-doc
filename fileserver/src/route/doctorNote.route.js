'use strict';

const express = require('express');
const ctrl = require('../controller/doctorNote.controller');

const router = express.Router({ mergeParams: true });

router.post('/', (req, res) => ctrl.createNote(req, res));
router.get('/', (req, res) => ctrl.getNotes(req, res));

module.exports = router;
