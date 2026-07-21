/**
 * appscript-source/Code.gs
 * Web App that exports a specific range from a specific sheet as PDF
 * and returns it directly as the HTTP response.
 *
 * NOTE: This file is version-controlled here for reference/rollback,
 * but must still be manually copy-pasted into the Apps Script editor
 * (Extensions -> Apps Script, inside the target Sheet) and redeployed
 * whenever it changes. Apps Script does not read directly from GitHub.
 */

function doGet(e) {
  try {
    const spreadsheetId = e.parameter.spreadsheetId;
    const sheetName = e.parameter.sheetName;
    const range = e.parameter.range;
    const secret = e.parameter.secret;

    const SHARED_SECRET = PropertiesService.getScriptProperties().getProperty('SHARED_SECRET');
    if (!secret || secret !== SHARED_SECRET) {
      return ContentService.createTextOutput('Unauthorized').setMimeType(ContentService.MimeType.TEXT);
    }

    if (!spreadsheetId || !sheetName || !range) {
      return ContentService.createTextOutput('Missing required params: spreadsheetId, sheetName, range')
        .setMimeType(ContentService.MimeType.TEXT);
    }

    const pdfBlob = exportRangeAsPdf(spreadsheetId, sheetName, range);
    const base64Pdf = Utilities.base64Encode(pdfBlob.getBytes());

    return ContentService.createTextOutput(base64Pdf)
      .setMimeType(ContentService.MimeType.TEXT);

  } catch (err) {
    return ContentService.createTextOutput('Error: ' + err.message)
      .setMimeType(ContentService.MimeType.TEXT);
  }
}

function exportRangeAsPdf(spreadsheetId, sheetName, rangeA1) {
  const ss = SpreadsheetApp.openById(spreadsheetId);
  const sourceSheet = ss.getSheetByName(sheetName);
  if (!sourceSheet) throw new Error('Sheet not found: ' + sheetName);

  const sourceRange = sourceSheet.getRange(rangeA1);
  const numRows = sourceRange.getNumRows();
  const numCols = sourceRange.getNumColumns();

  const tempSheet = sourceSheet.copyTo(ss);
  tempSheet.setName('__temp_export_' + new Date().getTime());

  try {
    // Freeze all formulas into static values BEFORE deleting anything,
    // so formulas referencing cells outside our range don't break (#REF!).
    const fullDataRange = tempSheet.getDataRange();
    const frozenValues = fullDataRange.getValues();
    fullDataRange.setValues(frozenValues);

    const startRow = sourceRange.getRow();
    const startCol = sourceRange.getColumn();

    const lastRow = tempSheet.getMaxRows();
    const lastCol = tempSheet.getMaxColumns();

    if (startRow + numRows - 1 < lastRow) {
      tempSheet.deleteRows(startRow + numRows, lastRow - (startRow + numRows - 1));
    }
    if (startRow > 1) {
      tempSheet.deleteRows(1, startRow - 1);
    }

    if (startCol + numCols - 1 < lastCol) {
      tempSheet.deleteColumns(startCol + numCols, lastCol - (startCol + numCols - 1));
    }
    if (startCol > 1) {
      tempSheet.deleteColumns(1, startCol - 1);
    }

    SpreadsheetApp.flush();

    const url = 'https://docs.google.com/spreadsheets/d/' + spreadsheetId + '/export'
      + '?format=pdf'
      + '&gid=' + tempSheet.getSheetId()
      + '&size=A4'
      + '&portrait=true'
      + '&fitw=true'
      + '&gridlines=false'
      + '&printtitle=false'
      + '&sheetnames=false'
      + '&pagenumbers=false'
      + '&fzr=false'
      + '&top_margin=0.25&bottom_margin=0.25&left_margin=0.25&right_margin=0.25';

    const token = ScriptApp.getOAuthToken();
    const response = UrlFetchApp.fetch(url, {
      headers: { Authorization: 'Bearer ' + token }
    });

    const pdfBlob = response.getBlob().setName('report.pdf');
    ss.deleteSheet(tempSheet);

    return pdfBlob;

  } catch (err) {
    if (ss.getSheetByName(tempSheet.getName())) {
      ss.deleteSheet(tempSheet);
    }
    throw err;
  }
}