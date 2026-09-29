const express = require('express');
const { db } = require('../services/data/dbService');

const router = express.Router();

/**
 * GET /api/projects
 * List all projects from projects.json
 */
router.get('/', (_req, res) => {
  const projects = db.getProjects();
  return res.json({ count: projects.length, projects });
});

/**
 * POST /api/projects
 * Add a new project
 */
router.post('/', (req, res) => {
  const project = req.body;
  if (!project.name) {
    return res.status(400).json({ error: 'Project name is required.' });
  }
  project.project_id = `PROJ-${Date.now()}`;
  project.created_at = new Date().toISOString();
  db.addProject(project);
  return res.status(201).json({ success: true, project });
});

module.exports = router;
