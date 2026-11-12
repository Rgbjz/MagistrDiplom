import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import {
  confirmEmailTemplate,
  notificationTemplate,
  resetPasswordTemplate,
  type MailContent,
} from './mail.templates';
import { normalizeLocale } from '../../common/i18n';

/**
 * Sends transactional email over SMTP. Without SMTP_HOST it runs in
 * "dev mode": messages are only logged, and auth endpoints expose tokens.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null;
  private readonly from: string;
  private readonly appUrl: string;

  constructor(config: ConfigService) {
    const host = config.get<string>('SMTP_HOST');
    this.from = config.get<string>('MAIL_FROM') ?? 'LMS <no-reply@lms.local>';
    this.appUrl = (
      config.get<string>('APP_URL') ??
      config.get<string>('FRONTEND_URL')?.split(',')[0] ??
      'http://localhost:3000'
    )
      .trim()
      .replace(/\/$/, '');
    this.transporter = host
      ? nodemailer.createTransport({
          host,
          port: Number(config.get<string>('SMTP_PORT') ?? 587),
          secure: config.get<string>('SMTP_SECURE') === 'true',
          auth: config.get<string>('SMTP_USER')
            ? {
                user: config.get<string>('SMTP_USER'),
                pass: config.get<string>('SMTP_PASS'),
              }
            : undefined,
        })
      : null;
    if (!this.transporter) {
      this.logger.warn('SMTP_HOST is not set — emails are logged, not sent');
    }
  }

  /** True when real delivery is configured. */
  get enabled(): boolean {
    return this.transporter !== null;
  }

  link(path: string): string {
    return `${this.appUrl}${path.startsWith('/') ? path : `/${path}`}`;
  }

  sendConfirmation(to: string, token: string, locale?: string | null): void {
    const url = this.link(`/confirm?token=${encodeURIComponent(token)}`);
    this.dispatch(to, confirmEmailTemplate(url, normalizeLocale(locale)), url);
  }

  sendPasswordReset(to: string, token: string, locale?: string | null): void {
    const url = this.link(`/reset-password?token=${encodeURIComponent(token)}`);
    this.dispatch(to, resetPasswordTemplate(url, normalizeLocale(locale)), url);
  }

  sendNotification(
    to: string,
    input: { title: string; body?: string | null; link?: string | null },
    locale?: string | null,
  ): void {
    const url = this.link(input.link ?? '/notifications');
    this.dispatch(
      to,
      notificationTemplate(
        { ...input, url },
        this.link('/profile'),
        normalizeLocale(locale),
      ),
      url,
    );
  }

  /** Fire-and-forget: delivery problems are logged, never thrown. */
  private dispatch(to: string, mail: MailContent, link: string): void {
    if (!this.transporter) {
      this.logger.log(
        `[dev mail] to=${to} subject="${mail.subject}" link=${link}`,
      );
      return;
    }
    this.transporter
      .sendMail({ from: this.from, to, ...mail })
      .catch((err: unknown) => {
        const reason = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `Failed to send "${mail.subject}" to ${to}: ${reason}`,
        );
      });
  }
}
