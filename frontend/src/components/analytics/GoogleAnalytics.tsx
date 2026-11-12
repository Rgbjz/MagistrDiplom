'use client';

import { Suspense, useEffect } from 'react';
import Script from 'next/script';
import { usePathname, useSearchParams } from 'next/navigation';
import { GA_ID, gaBootstrapScript, pageView } from '../../lib/analytics';
import { ConsentBanner } from './ConsentBanner';

/** Sends a page_view on every App Router navigation. */
function PageViews() {
  const pathname = usePathname();
  const search = useSearchParams().toString();

  useEffect(() => {
    pageView(search ? `${pathname}?${search}` : pathname);
  }, [pathname, search]);

  return null;
}

export function GoogleAnalytics() {
  if (!GA_ID) return null;
  return (
    <>
      <Script id="ga-bootstrap" strategy="afterInteractive">
        {gaBootstrapScript(GA_ID)}
      </Script>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
        strategy="afterInteractive"
      />
      <Suspense fallback={null}>
        <PageViews />
      </Suspense>
      <ConsentBanner />
    </>
  );
}
