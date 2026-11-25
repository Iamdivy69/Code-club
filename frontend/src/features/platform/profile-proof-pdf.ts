import { PDFDocument, PDFName, PDFString, StandardFonts, rgb } from 'pdf-lib';
import QRCode from 'qrcode';
import type { ProfileSnapshot } from '../../../../shared/src/types/practice';

export async function downloadProfileProof(snapshot: ProfileSnapshot, verificationUrl: string) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const { width, height } = page.getSize();
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const ink = rgb(.06, .10, .19);
  const secondary = rgb(.26, .34, .43);
  const accent = rgb(.02, .4, .52);
  const date = new Intl.DateTimeFormat('en', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(snapshot.signedAt));

  pdf.setTitle('DSA V2 Practice Profile');
  pdf.setAuthor('DSA V2 Practice');
  pdf.setSubject('Profile verification ' + snapshot.id);
  pdf.setLanguage('en');
  page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(.978, .988, .993) });
  page.drawRectangle({ x: 38, y: 38, width: width - 76, height: height - 76, borderWidth: .85, borderColor: rgb(.66, .77, .83) });
  page.drawText('DSA V2 PRACTICE', { x: 69, y: 746, size: 11, font: bold, color: accent });
  page.drawText('Practice Profile', { x: 69, y: 692, size: 36, font: bold, color: ink });
  page.drawText('@' + snapshot.handle, { x: 69, y: 650, size: 20, font: bold, color: ink });
  page.drawText('Signed ' + date + ' (UTC)', { x: 69, y: 614, size: 12, font: regular, color: secondary });

  const stats = [
    ['Problems solved', snapshot.solved], ['XP', snapshot.xp], ['Level', snapshot.level],
    ['Easy', snapshot.easy], ['Medium', snapshot.medium], ['Hard', snapshot.hard],
  ] as const;
  stats.forEach(([label, value], index) => {
    const x = 69 + index % 3 * 153;
    const y = index < 3 ? 521 : 420;
    page.drawText(String(value), { x, y, size: 27, font: bold, color: ink });
    page.drawText(label, { x, y: y - 24, size: 12, font: regular, color: secondary });
  });
  page.drawLine({ start: { x: 69, y: 350 }, end: { x: width - 69, y: 350 }, thickness: 1, color: rgb(.72, .81, .86) });

  const qr = await pdf.embedPng(await QRCode.toDataURL(verificationUrl, { errorCorrectionLevel: 'M', margin: 4, width: 512 }));
  page.drawImage(qr, { x: 69, y: 173, width: 130, height: 130 });
  const label = 'Verify profile';
  page.drawText(label, { x: 228, y: 257, size: 16, font: bold, color: accent });
  page.drawText('Scan the QR code or open the link', { x: 228, y: 231, size: 12, font: regular, color: secondary });
  page.drawText('to check the signed totals.', { x: 228, y: 212, size: 12, font: regular, color: secondary });
  page.drawText('Verification ID', { x: 69, y: 137, size: 10, font: regular, color: secondary });
  page.drawText(snapshot.id, { x: 69, y: 118, size: 12, font: regular, color: ink });
  const annotation = pdf.context.register(pdf.context.obj({
    Type: 'Annot', Subtype: 'Link', Rect: [224, 253, 232 + bold.widthOfTextAtSize(label, 16), 276], Border: [0, 0, 0],
    A: { Type: 'Action', S: 'URI', URI: PDFString.of(verificationUrl) },
  }));
  page.node.set(PDFName.of('Annots'), pdf.context.obj([annotation]));

  const data = await pdf.save();
  const url = URL.createObjectURL(new Blob([new Uint8Array(data)], { type: 'application/pdf' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = snapshot.handle + '-practice-profile.pdf';
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
