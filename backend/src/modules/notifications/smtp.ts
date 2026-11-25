import nodemailer from 'nodemailer';
import { z } from 'zod';

const smtpSettings = z.object({
  SMTP_HOST: z.string().trim().min(1),
  SMTP_PORT: z.preprocess((value) => value || 587, z.coerce.number().int().min(1).max(65_535)),
  SMTP_USER: z.string().min(1),
  SMTP_PASS: z.string().min(1),
  EMAIL_FROM: z.string().trim().min(1),
  FRONTEND_URL: z.url(),
});

export type MailMessage = { to: string; subject: string; text: string; messageId?: string };
export type MailDelivery = { site: URL; send(message: MailMessage): Promise<void> };

export function smtpDelivery(input: NodeJS.ProcessEnv, requireHttps = false) {
  const result = smtpSettings.safeParse(input);
  if (!result.success) throw new Error('Configure FRONTEND_URL and the DSA SMTP settings before enabling email.');
  const settings = result.data;
  const site = new URL(settings.FRONTEND_URL);
  const validProtocol = site.protocol === 'https:' || (!requireHttps && site.protocol === 'http:');
  if (!validProtocol || site.username || site.password || site.hash || site.search) {
    throw new Error('Set FRONTEND_URL to the application URL.');
  }

  const transporter = nodemailer.createTransport({
    host: settings.SMTP_HOST, port: settings.SMTP_PORT, secure: settings.SMTP_PORT === 465,
    requireTLS: settings.SMTP_PORT !== 465, auth: { user: settings.SMTP_USER, pass: settings.SMTP_PASS },
    connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000,
    disableFileAccess: true, disableUrlAccess: true,
  });
  return {
    site,
    async verify() { await transporter.verify(); },
    async send(message: MailMessage) {
      const output = await transporter.sendMail({ ...message, from: settings.EMAIL_FROM, to: { address: message.to, name: '' } });
      if (output.accepted.length !== 1 || output.rejected.length) throw new Error('SMTP did not confirm delivery.');
    },
  };
}
