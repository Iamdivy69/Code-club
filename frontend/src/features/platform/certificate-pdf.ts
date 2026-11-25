import { PDFDocument, PDFName, PDFString, StandardFonts, rgb } from 'pdf-lib';
import type { PDFFont, PDFPage } from 'pdf-lib';
import QRCode from 'qrcode';
import type { CertificateDocument } from '../../../../shared/src/types/practice';

const ink = rgb(.06, .1, .19);
const secondary = rgb(.26, .34, .43);
const accent = rgb(.02, .4, .52);
const maxWidth = 690;
const issueDate = new Intl.DateTimeFormat('en', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

function fit(page: PDFPage, font: PDFFont, text: string, x: number, y: number, limit: number, size: number) {
  const width = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x, y, font, size: width > limit ? size * limit / width : size, color: ink });
}

async function drawCredentialText(pdf: PDFDocument, page: PDFPage, bold: PDFFont, value: string, y: number, size: number) {
  const text = value.replace(/[\r\n\t\u0000-\u001f\u007f]/g, ' ').trim();
  let encodable = true;
  try { bold.encodeText(text); } catch { encodable = false; }
  if (encodable) {
    fit(page, bold, text, 76, y, maxWidth, size);
    return;
  }
  const canvas = document.createElement('canvas');
  canvas.width = maxWidth * 3;
  const height = Math.ceil(size * 1.45);
  canvas.height = height * 3;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not render the certificate name.');
  ctx.scale(3, 3);
  ctx.font = 'bold ' + size + 'px system-ui, sans-serif';
  const width = ctx.measureText(text).width;
  if (width > maxWidth) ctx.font = 'bold ' + (size * maxWidth / width) + 'px system-ui, sans-serif';
  ctx.fillStyle = '#10192f';
  ctx.textBaseline = 'alphabetic';
  const baseline = size * 1.08;
  ctx.fillText(text, 0, baseline);
  const image = await pdf.embedPng(canvas.toDataURL('image/png'));
  page.drawImage(image, { x: 76, y: y - (height - baseline), width: maxWidth, height });
}

export async function downloadCertificate(cert: CertificateDocument, verificationUrl: string) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([841.89, 595.28]);
  const { width, height } = page.getSize();
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  pdf.setTitle('DSA V2 Practice Certificate');
  pdf.setAuthor('DSA V2 Practice');
  pdf.setSubject('Certificate ' + cert.id);
  pdf.setLanguage('en');

  page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(.978, .988, .993) });
  page.drawRectangle({ x: 39, y: 39, width: width - 78, height: height - 78, borderWidth: .85, borderColor: rgb(.66, .77, .83) });
  page.drawRectangle({ x: 76, y: 490, width: 42, height: 4, color: accent });
  page.drawText('DSA V2 PRACTICE', { x: 76, y: 515, size: 12, font: bold, color: accent });
  page.drawText('Certificate of Achievement', { x: 76, y: 433, size: 34, font: bold, color: ink });
  page.drawText('Presented to', { x: 76, y: 389, size: 15, font: regular, color: secondary });
  await drawCredentialText(pdf, page, bold, cert.issuerName, 340, 40);
  page.drawText(cert.kind === 'certification' ? 'For earning the certification in' : 'For completing the practice path in',
    { x: 76, y: 291, size: 15, font: regular, color: secondary });
  await drawCredentialText(pdf, page, bold, cert.title, 251, 30);
  page.drawLine({ start: { x: 76, y: 207 }, end: { x: width - 76, y: 207 }, thickness: 1, color: rgb(.72, .81, .86) });
  page.drawText('Issued ' + issueDate.format(new Date(cert.createdAt)), { x: 76, y: 156, size: 14, font: bold, color: ink });
  page.drawText('Certificate ID', { x: 76, y: 129, size: 10, font: regular, color: secondary });
  page.drawText(cert.id, { x: 76, y: 110, size: 12, font: regular, color: ink });

  const qr = await pdf.embedPng(await QRCode.toDataURL(verificationUrl, { errorCorrectionLevel: 'M', margin: 4, width: 512 }));
  const qrX = width - 76 - 106;
  page.drawImage(qr, { x: qrX, y: 78, width: 106, height: 106 });
  const label = 'Verify this certificate';
  const labelWidth = bold.widthOfTextAtSize(label, 10);
  const linkX = qrX + (106 - labelWidth) / 2;
  page.drawText(label, { x: linkX, y: 64, size: 10, font: bold, color: accent });
  const annotation = pdf.context.register(pdf.context.obj({
    Type: 'Annot', Subtype: 'Link', Rect: [linkX - 3, 62, linkX + labelWidth + 3, 76], Border: [0, 0, 0],
    A: { Type: 'Action', S: 'URI', URI: PDFString.of(verificationUrl) },
  }));
  page.node.set(PDFName.of('Annots'), pdf.context.obj([annotation]));

  const data = await pdf.save();
  const url = URL.createObjectURL(new Blob([new Uint8Array(data)], { type: 'application/pdf' }));
  const link = window.document.createElement('a');
  link.href = url;
  link.download = 'dsa-v2-certificate-' + cert.id + '.pdf';
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
