import { CodeChallengeMethod, OAuth2Client } from 'google-auth-library';
import type { Config } from '../config.js';

export const googleCallback = '/api/auth/google/callback';

export type GoogleProvider = {
  site: URL;
  authorize(input: { state: string; nonce: string; challenge: string }): string;
  redeem(code: string, verifier: string): Promise<unknown>;
};

export function googleProvider(config: Config): GoogleProvider | undefined {
  const clientId = config.PRACTICE_GOOGLE_CLIENT_ID;
  const clientSecret = config.PRACTICE_GOOGLE_CLIENT_SECRET;
  if (!clientId && !clientSecret) return;
  if (!clientId || !clientSecret) throw new Error('Set both Google sign-in credentials.');
  const site = URL.parse(config.FRONTEND_URL ?? '');
  const local = config.NODE_ENV !== 'production' && site?.protocol === 'http:' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(site.hostname);
  if (!site || (site.protocol !== 'https:' && !local) || site.pathname !== '/' ||
      site.username || site.password || site.search || site.hash) {
    throw new Error('Set FRONTEND_URL to the standalone origin before enabling Google sign-in.');
  }
  const redirectUri = new URL(googleCallback, site).href;
  const client = new OAuth2Client({
    clientId, clientSecret, redirectUri, transporterOptions: { timeout: 5000 },
  });
  return {
    site,
    authorize({ state, nonce, challenge }) {
      const url = new URL(client.generateAuthUrl({
        scope: ['openid', 'email', 'profile'], state, code_challenge: challenge,
        code_challenge_method: CodeChallengeMethod.S256,
      }));
      url.searchParams.set('nonce', nonce);
      return url.href;
    },
    async redeem(code, verifier) {
      const { tokens } = await client.getToken({ code, codeVerifier: verifier });
      if (!tokens.id_token) throw new Error('Google returned no identity token.');
      const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: clientId });
      return ticket.getPayload();
    },
  };
}
