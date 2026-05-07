'use strict';

const express = require('express');
const ctrl = require('../../controller/agent/patient.controller');

const patientRouter = express.Router();
const encounterRouter = express.Router();

patientRouter.get('/', (req, res) => ctrl.listPatients(req, res));
patientRouter.get('/by-mrn/:mrn', (req, res) => ctrl.getPatientByMrn(req, res));
patientRouter.get('/:id/summary', (req, res) => ctrl.getPatientSummary(req, res));
patientRouter.get('/:id/encounters', (req, res) => ctrl.getEncounters(req, res));
patientRouter.get('/:id/allergies', (req, res) => ctrl.getAllergies(req, res));
patientRouter.get('/:id/medical-history', (req, res) => ctrl.getMedicalHistory(req, res));
patientRouter.get('/:id/care-plans', (req, res) => ctrl.getCarePlans(req, res));
patientRouter.get('/:id/immunizations', (req, res) => ctrl.getImmunizations(req, res));
patientRouter.get('/:id/observations', (req, res) => ctrl.getObservations(req, res));
patientRouter.get('/:id/medications', (req, res) => ctrl.getMedications(req, res));
patientRouter.get('/:id/lab-results', (req, res) => ctrl.getLabResults(req, res));
patientRouter.get('/:id/vitals', (req, res) => ctrl.getVitals(req, res));

encounterRouter.get('/:id', (req, res) => ctrl.getEncounter(req, res));

module.exports = { patientRouter, encounterRouter };
