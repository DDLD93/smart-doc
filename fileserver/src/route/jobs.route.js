const express = require('express');
const fileController = require('../controller/file.controller');

const api = express.Router();

api.get('/:jobId', async (req, res) => {
  try {
    const out = await fileController.getJob(req.params.jobId);
    if (out.error) {
      return res.status(404).json(out);
    }
    return res.status(200).json(out);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to get job status' });
  }
});

module.exports = api;
