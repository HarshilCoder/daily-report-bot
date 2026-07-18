// convert.js — more explicit raw-bitmap-to-PNG approach
const { PDFiumLibrary } = require('@hyzyla/pdfium');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

let libraryInstance = null;

async function getLibrary() {
  if (!libraryInstance) {
    libraryInstance = await PDFiumLibrary.init();
  }
  return libraryInstance;
}

async function convertPdfToPng(pdfPath, outputName, outputDir) {
  if (!fs.existsSync(pdfPath)) {
    throw new Error(`PDF not found at: ${pdfPath}`);
  }

  console.log('[convert] Converting PDF to PNG (PDFium)...', { pdfPath });

  const library = await getLibrary();
  const buffer = await fs.promises.readFile(pdfPath);

  let document;
  try {
    document = await library.loadDocument(buffer);
  } catch (err) {
    throw new Error(`Failed to load PDF into PDFium: ${err.message}`);
  }

  const pages = Array.from(document.pages());
  const firstPage = pages[0];

  if (!firstPage) {
    document.destroy();
    throw new Error('PDF has no pages to render.');
  }

  let raw;
  try {
    // Get RAW RGBA bitmap data (default engine, no dependency on sharp internally)
    raw = await firstPage.render({
      scale: 3,
      render: 'bitmap'
    });
  } catch (err) {
    document.destroy();
    throw new Error(`PDFium render failed: ${err.message}`);
  }

  console.log('[convert] Raw bitmap:', { width: raw.width, height: raw.height, bytes: raw.data.length });

  // Encode the raw RGBA buffer into a real PNG, then auto-crop whitespace
  const pngBuffer = await sharp(raw.data, {
    raw: {
      width: raw.width,
      height: raw.height,
      channels: 4
    }
  })
    .trim()   // auto-crops uniform white/blank borders
    .png()
    .toBuffer();

  const outputPath = path.join(outputDir, `${outputName}.png`);
  await fs.promises.writeFile(outputPath, pngBuffer);

  document.destroy();

  console.log('[convert] PNG created at:', outputPath);

  return outputPath;
}

module.exports = { convertPdfToPng };