import { t, type Locale } from '../../common/i18n';

export interface MailContent {
  subject: string;
  html: string;
  text: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

interface LayoutInput {
  locale: Locale;
  preheader: string;
  title: string;
  paragraphs: string[];
  button?: { label: string; url: string };
  note?: string;
  footer?: { text: string; linkLabel: string; url: string };
}

/** Table-based layout with inline styles so it renders in common mail clients. */
function layout(input: LayoutInput): string {
  const paragraphs = input.paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#334155;">${escapeHtml(p)}</p>`,
    )
    .join('');
  const button = input.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;"><tr><td style="border-radius:10px;background:#2563eb;">
         <a href="${escapeHtml(input.button.url)}" style="display:inline-block;padding:14px 24px;font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">${escapeHtml(input.button.label)}</a>
       </td></tr></table>
       <p style="margin:0 0 16px;font-size:13px;line-height:1.5;color:#64748b;">${escapeHtml(t(input.locale, 'mail.buttonFallback'))}<br><a href="${escapeHtml(input.button.url)}" style="color:#2563eb;word-break:break-all;">${escapeHtml(input.button.url)}</a></p>`
    : '';
  const note = input.note
    ? `<p style="margin:0;font-size:13px;line-height:1.5;color:#64748b;">${escapeHtml(input.note)}</p>`
    : '';
  const footer = input.footer
    ? `${escapeHtml(input.footer.text)} <a href="${escapeHtml(input.footer.url)}" style="color:#64748b;">${escapeHtml(input.footer.linkLabel)}</a>`
    : escapeHtml(t(input.locale, 'mail.defaultFooter'));

  return `<!doctype html>
<html lang="${input.locale}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(input.title)}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Inter,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(input.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
<tr><td style="padding:0 4px 16px;">
  <table role="presentation" cellpadding="0" cellspacing="0"><tr>
    <td style="width:32px;height:32px;border-radius:8px;background:#2563eb;color:#ffffff;font-weight:700;font-size:15px;text-align:center;">L</td>
    <td style="padding-left:10px;font-size:18px;font-weight:700;color:#0f172a;">LMS</td>
  </tr></table>
</td></tr>
<tr><td style="background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;padding:32px;">
  <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#0f172a;">${escapeHtml(input.title)}</h1>
  ${paragraphs}
  ${button}
  ${note}
</td></tr>
<tr><td style="padding:16px 4px;font-size:12px;line-height:1.5;color:#64748b;">${footer}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

export function confirmEmailTemplate(
  url: string,
  locale: Locale = 'uk',
): MailContent {
  const title = t(locale, 'mail.confirm.title');
  return {
    subject: t(locale, 'mail.confirm.subject'),
    html: layout({
      locale,
      preheader: t(locale, 'mail.confirm.preheader'),
      title,
      paragraphs: [t(locale, 'mail.confirm.body')],
      button: { label: t(locale, 'mail.confirm.button'), url },
      note: t(locale, 'mail.confirm.note'),
    }),
    text: `${title}\n\n${t(locale, 'mail.confirm.text')}\n${url}\n\n${t(locale, 'mail.confirm.textNote')}`,
  };
}

export function resetPasswordTemplate(
  url: string,
  locale: Locale = 'uk',
): MailContent {
  const title = t(locale, 'mail.reset.title');
  return {
    subject: t(locale, 'mail.reset.subject'),
    html: layout({
      locale,
      preheader: t(locale, 'mail.reset.preheader'),
      title,
      paragraphs: [t(locale, 'mail.reset.body')],
      button: { label: t(locale, 'mail.reset.button'), url },
      note: t(locale, 'mail.reset.note'),
    }),
    text: `${title}\n\n${t(locale, 'mail.reset.text')}\n${url}\n\n${t(locale, 'mail.reset.textNote')}`,
  };
}

export function notificationTemplate(
  input: { title: string; body?: string | null; url: string },
  profileUrl: string,
  locale: Locale = 'uk',
): MailContent {
  const footer = t(locale, 'mail.notification.footer');
  return {
    subject: `${input.title} — LMS`,
    html: layout({
      locale,
      preheader: input.body ?? input.title,
      title: input.title,
      paragraphs: input.body ? [input.body] : [],
      button: { label: t(locale, 'mail.notification.button'), url: input.url },
      footer: {
        text: footer,
        linkLabel: t(locale, 'mail.notification.footerLink'),
        url: profileUrl,
      },
    }),
    text: `${input.title}\n\n${input.body ? `${input.body}\n\n` : ''}${t(locale, 'mail.notification.open')} ${input.url}\n\n${footer} ${profileUrl}`,
  };
}
