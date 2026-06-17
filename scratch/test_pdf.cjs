const pdf = require('pdf-parse');
console.log('PDFParse type:', typeof pdf.PDFParse);
if (typeof pdf.PDFParse === 'function') {
  console.log('PDFParse properties:', Object.keys(pdf.PDFParse));
  console.log('PDFParse prototype:', Object.keys(pdf.PDFParse.prototype || {}));
  console.log('PDFParse function string:', pdf.PDFParse.toString());
}
