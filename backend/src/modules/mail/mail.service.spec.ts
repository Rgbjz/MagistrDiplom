import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';

function service(env: Record<string, string>) {
  return new MailService(new ConfigService(env));
}

describe('MailService', () => {
  let log: jest.SpyInstance;

  beforeEach(() => {
    log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
  });

  afterEach(() => jest.restoreAllMocks());

  it('is disabled without SMTP_HOST and logs instead of sending', () => {
    const mail = service({ APP_URL: 'https://lms.example/' });
    expect(mail.enabled).toBe(false);
    mail.sendConfirmation('a@b.c', 'tok en');
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('https://lms.example/confirm?token=tok%20en'),
    );
  });

  it('builds links from APP_URL, falling back to the first FRONTEND_URL', () => {
    expect(service({ APP_URL: 'https://a.dev/' }).link('/profile')).toBe(
      'https://a.dev/profile',
    );
    expect(
      service({ FRONTEND_URL: 'https://b.dev, https://c.dev' }).link('x'),
    ).toBe('https://b.dev/x');
  });

  it('is enabled when SMTP_HOST is configured', () => {
    expect(service({ SMTP_HOST: 'smtp.example.com' }).enabled).toBe(true);
  });

  it('reports delivery failures without throwing', async () => {
    const mail = service({ SMTP_HOST: 'smtp.example.com' });
    const error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    const transporter = (
      mail as unknown as {
        transporter: { sendMail: jest.Mock };
      }
    ).transporter;
    transporter.sendMail = jest.fn().mockRejectedValue(new Error('boom'));
    expect(() => mail.sendPasswordReset('a@b.c', 't')).not.toThrow();
    await new Promise((r) => setImmediate(r));
    expect(error).toHaveBeenCalledWith(expect.stringContaining('boom'));
  });

  it('returns dev tokens only in development without SMTP', () => {
    expect(service({}).exposeDevTokens).toBe(true);
    // Production without SMTP must never put confirm/reset tokens in responses.
    expect(service({ NODE_ENV: 'production' }).exposeDevTokens).toBe(false);
    expect(service({ SMTP_HOST: 'smtp.example.com' }).exposeDevTokens).toBe(
      false,
    );
  });
});
