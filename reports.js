// reports.js
// Loads and looks up report definitions from reports.json

const fs = require('fs');
const path = require('path');

function loadReports() {
  const filePath = path.join(__dirname, 'reports.json');
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw);
}

function findReportByTrigger(trigger) {
  const reports = loadReports();
  const normalized = (trigger || '').trim().toLowerCase();
  return reports.find(r => r.trigger.toLowerCase() === normalized);
}

module.exports = { loadReports, findReportByTrigger };