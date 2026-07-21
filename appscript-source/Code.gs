/**
 * appscript-source/Code.gs
 * Existing PDF export behavior is UNCHANGED.
 * New: an optional mode=values branch, used only by the opt-in AI feature.
 */

function doGet(e) {
  try {
    const spreadsheetId = e.parameter.spreadsheetId;
    const sheetName = e.parameter.sheetName;
    const range = e.parameter.range;
    const secret = e.parameter.secret;
    const mode = e.parameter.mode; // undefined for all your current calls

    const SHARED_SECRET = PropertiesService.getScriptProperties().getProperty('SHARED_SECRET');
    if (!secret || secret !== SHARED_SECRET) {
      return ContentService.createTextOutput('Unauthorized').setMimeType(ContentService.MimeType.TEXT);
    }

    if (!spreadsheetId || !sheetName || !range) {
      return ContentService.createTextOutput('Missing required params: spreadsheetId, sheetName, range')
        .setMimeType(ContentService.MimeType.TEXT);
    }

    // NEW branch — only used by the opt-in AI insight feature
    if (mode === 'values') {
      const values = getRangeValues(spreadsheetId, sheetName, range);
      return ContentService.createTextOutput(JSON.stringify({ values: values }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Existing behavior — completely unchanged, exactly what's live right now
    const pdfBlob = exportRangeAsPdf(spreadsheetId, sheetName, range);
    const base64Pdf = Utilities.base64Encode(pdfBlob.getBytes());
    return ContentService.createTextOutput(base64Pdf)
      .setMimeType(ContentService.MimeType.TEXT);

  } catch (err) {
    return ContentService.createTextOutput('Error: ' + err.message)
      .setMimeType(ContentService.MimeType.TEXT);
  }
}

// NEW — lightweight, read-only, no sheet duplication needed
function getRangeValues(spreadsheetId, sheetName, rangeA1) {
  const ss = SpreadsheetApp.openById(spreadsheetId);
  const sourceSheet = ss.getSheetByName(sheetName);
  if (!sourceSheet) throw new Error('Sheet not found: ' + sheetName);
  return sourceSheet.getRange(rangeA1).getValues();
}

// UNCHANGED — this is your exact current working function
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