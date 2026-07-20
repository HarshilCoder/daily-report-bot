// reports.js
// Loads and looks up report and bundle definitions.

const fs = require('fs');
const path = require('path');

function loadReports() {
  const filePath = path.join(__dirname, 'reports.json');
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw);
}

function loadBundles() {
  const filePath = path.join(__dirname, 'bundles.json');
  if (!fs.existsSync(filePath)) return []; // optional file — fine if it doesn't exist
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw);
}

function findReportByTrigger(trigger) {
  const reports = loadReports();
  const normalized = (trigger || '').trim().toLowerCase();
  return reports.find(r => r.trigger.toLowerCase() === normalized);
}

function findReportById(id) {
  const reports = loadReports();
  return reports.find(r => r.id === id);
}

function findBundleByTrigger(trigger) {
  const bundles = loadBundles();
  const normalized = (trigger || '').trim().toLowerCase();
  return bundles.find(b => b.trigger.toLowerCase() === normalized);
}

module.exports = {
  loadReports,
  loadBundles,
  findReportByTrigger,
  findReportById,
  findBundleByTrigger
};