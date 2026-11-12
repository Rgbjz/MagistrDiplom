'use client';

import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useTranslations } from 'next-intl';
import { Download, Link2 } from 'lucide-react';
import { Button, useToast } from '../../../../components/ui';
import { APP_URL } from '../../../../lib/env';
import styles from './certificate.module.scss';

function usePageUrl() {
  const [url, setUrl] = useState('');
  useEffect(() => {
    // Prefer the canonical domain so QR codes from preview deployments still work.
    setUrl(`${APP_URL || window.location.origin}${window.location.pathname}`);
  }, []);
  return url;
}

export function CertificateActions() {
  const t = useTranslations('certificate');
  const toast = useToast();
  const url = usePageUrl();

  async function share() {
    try {
      await navigator.clipboard.writeText(url);
      toast(t('copied'));
    } catch {
      toast(t('copyError'), 'error');
    }
  }

  return (
    <div className={styles.actions}>
      <Button variant="outline" onClick={() => window.print()}>
        <Download size={18} aria-hidden="true" />
        {t('downloadPdf')}
      </Button>
      <Button onClick={share} disabled={!url}>
        <Link2 size={18} aria-hidden="true" />
        {t('share')}
      </Button>
    </div>
  );
}

export function CertificateQr() {
  const t = useTranslations('certificate');
  const url = usePageUrl();
  if (!url) return <div className={styles.qrPlaceholder} aria-hidden="true" />;
  return (
    <QRCodeSVG
      value={url}
      size={96}
      level="M"
      role="img"
      aria-label={t('qrLabel')}
      className={styles.qr}
    />
  );
}

export function VerifyLink() {
  const t = useTranslations('certificate');
  const url = usePageUrl();
  return (
    <label className={styles.verify}>
      {t('verifyLink')}
      <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
    </label>
  );
}
