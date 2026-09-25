import { fileURLToPath } from 'node:url';

const LOGO_CID = 'after-login-logo';
const LOGO_PATH = fileURLToPath(new URL('../public/after-login-logo-email.png', import.meta.url));

export function newsletterLogoAttachment() {
  return {
    filename: 'after-login-logo.png',
    path: LOGO_PATH,
    cid: LOGO_CID
  };
}

export function newsletterLogoHeader(language) {
  const alt = language === 'en' ? 'After Login' : 'После логина';
  return `<div style="margin:0 0 24px;text-align:center;">
    <img src="cid:${LOGO_CID}" width="320" alt="${alt}" style="display:block;width:100%;max-width:320px;height:auto;margin:0 auto;border:0;border-radius:10px;">
  </div>`;
}