import { PDFParse } from 'pdf-parse';

try {
  const buf = Buffer.from('%PDF-1.4 ...'); // Dummy PDF header
  const parser = new PDFParse({ data: buf });
  console.log('Created parser:', parser);
  parser.getText().then(res => {
    console.log('Result:', res);
  }).catch(err => {
    console.error('getText failed:', err);
  });
} catch (e) {
  console.error('Constructor failed:', e);
}
