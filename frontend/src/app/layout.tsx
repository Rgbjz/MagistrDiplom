import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';
import './globals.scss';
import { Providers } from './providers';
import { GoogleAnalytics } from '../components/analytics/GoogleAnalytics';

const inter = Inter({ subsets: ['latin', 'latin-ext', 'cyrillic'] });

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta');
  return {
    title: { default: t('title'), template: '%s · LMS' },
    description: t('description'),
  };
}

const themeScript = `(function(){try{var t=localStorage.getItem('theme');if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const messages = await getMessages();
  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={inter.className}>
        <NextIntlClientProvider locale={locale} messages={messages} timeZone="Europe/Kyiv">
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
        <GoogleAnalytics />
      </body>
    </html>
  );
}
