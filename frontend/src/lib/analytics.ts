/**
 * Google Analytics 4 helpers. Everything is a no-op when NEXT_PUBLIC_GA_ID is
 * not set, and nothing personal (emails, names) is ever sent.
 */

export const GA_ID = process.env.NEXT_PUBLIC_GA_ID ?? '';

const CONSENT_KEY = 'lms:analytics-consent';
export type Consent = 'granted' | 'denied';

type GtagItem = {
  item_id: string;
  item_name: string;
  price?: number;
  quantity?: number;
};

/** Event name → allowed parameters. */
export interface AnalyticsEvents {
  sign_up: { method: 'email'; role: 'STUDENT' | 'TEACHER' };
  login: { method: 'email' };
  view_item: { currency: 'UAH'; value: number; items: GtagItem[] };
  search: { search_term: string };
  begin_checkout: { currency: 'UAH'; value: number; items: GtagItem[] };
  purchase: {
    transaction_id: string;
    currency: 'UAH';
    value: number;
    items: GtagItem[];
  };
  generate_lead: { item_id: string; enrollment: 'request' | 'free' };
  test_complete: { test_id: string; score: number; passed: boolean };
  certificate_issued: { course_id: string };
}

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

function gtag(...args: unknown[]) {
  if (typeof window === 'undefined' || !GA_ID || !window.gtag) return;
  window.gtag(...args);
}

export function track<E extends keyof AnalyticsEvents>(
  event: E,
  params: AnalyticsEvents[E],
) {
  gtag('event', event, params);
}

export function pageView(path: string) {
  gtag('event', 'page_view', {
    page_path: path,
    page_location: window.location.href,
    page_title: document.title,
  });
}

export function readConsent(): Consent | null {
  try {
    const v = localStorage.getItem(CONSENT_KEY);
    return v === 'granted' || v === 'denied' ? v : null;
  } catch {
    return null;
  }
}

export function saveConsent(value: Consent) {
  try {
    localStorage.setItem(CONSENT_KEY, value);
  } catch {
    // private mode — choice lasts for this page only
  }
  gtag('consent', 'update', {
    analytics_storage: value,
    // We never use advertising features.
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  });
}

/** Inline bootstrap: consent defaults must be set before gtag('config'). */
export function gaBootstrapScript(id: string): string {
  return `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;
var c=null;try{c=localStorage.getItem('${CONSENT_KEY}');}catch(e){}
gtag('consent','default',{analytics_storage:c==='granted'?'granted':'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',wait_for_update:500});
gtag('js',new Date());
gtag('config','${id}',{send_page_view:false,anonymize_ip:true});`;
}
