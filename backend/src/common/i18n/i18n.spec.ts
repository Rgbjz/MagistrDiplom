import { MESSAGES } from './messages';
import { LOCALES, normalizeLocale, render, t } from './index';
import {
  confirmEmailTemplate,
  notificationTemplate,
  resetPasswordTemplate,
} from '../../modules/mail/mail.templates';

describe('backend i18n', () => {
  it('has the same keys in every language', () => {
    const uk = Object.keys(MESSAGES.uk).sort();
    for (const locale of LOCALES) {
      expect(Object.keys(MESSAGES[locale]).sort()).toEqual(uk);
    }
  });

  it('fills placeholders and falls back to Ukrainian for unknown locales', () => {
    expect(t('en', 'notify.testPassed.title', { test: 'SQL', score: 80 })).toBe(
      'Test “SQL” passed: 80%',
    );
    expect(t('de', 'call.missed')).toBe('Пропущений відеодзвінок');
    expect(normalizeLocale('xx')).toBe('uk');
    expect(render('plain', 'en')).toBe('plain');
    expect(render(null, 'en')).toBeNull();
  });

  it('localizes the confirmation and reset emails', () => {
    const en = confirmEmailTemplate('https://lms/confirm?token=1', 'en');
    expect(en.subject).toBe('Confirm your email — LMS');
    expect(en.html).toContain('<html lang="en">');
    expect(en.html).toContain('Confirm email');
    const pl = resetPasswordTemplate('https://lms/reset?token=1', 'pl');
    expect(pl.subject).toBe('Resetowanie hasła — LMS');
    expect(pl.text).toContain('Ustaw nowe hasło');
    expect(confirmEmailTemplate('u').subject).toBe('Підтвердження email — LMS');
  });

  it('localizes the notification email chrome', () => {
    const mail = notificationTemplate(
      { title: 'Hi', body: null, url: 'https://lms/x' },
      'https://lms/profile',
      'en',
    );
    expect(mail.html).toContain('Open in LMS');
    expect(mail.text).toContain(
      'You can turn off these emails in your profile:',
    );
  });
});
