import { SystemConfig } from '../models/systemConfig.model';

export type TemplateLanguage = 'en' | 'te' | 'hi';

// Built-in English defaults. Admins can override any template/language via the
// generic system-config endpoint (key: 'messageTemplates'), e.g.:
// { "absenceAlert": { "te": "...", "hi": "..." } }
const DEFAULT_TEMPLATES: Record<string, Partial<Record<TemplateLanguage, string>>> = {
  absenceAlert: {
    en: 'Dear Parent, your child {{studentName}} is absent today. Please contact the school if this was not planned. Thank you.',
    te: 'ప్రియమైన తల్లిదండ్రులారా, మీ బిడ్డ {{studentName}} ఈరోజు పాఠశాలకు హాజరుకాలేదు. ఒకవేళ ముందస్తు సమాచారం లేకపోతే దయచేసి పాఠశాలను సంప్రదించండి. ధన్యవాదాలు.'
  },
  absenceAlertMorning: {
    en: 'Dear Parent, your child {{studentName}} was absent for the Morning session today. Please contact the school if this was not planned. Thank you.',
    te: 'ప్రియమైన తల్లిదండ్రులారా, మీ బిడ్డ {{studentName}} ఈరోజు ఉదయం పూట సెషన్‌కు హాజరుకాలేదు. ఒకవేళ ముందస్తు సమాచారం లేకపోతే దయచేసి పాఠశాలను సంప్రదించండి. ధన్యవాదాలు.'
  },
  absenceAlertAfternoon: {
    en: 'Dear Parent, your child {{studentName}} was absent for the Afternoon session today. Please contact the school if this was not planned. Thank you.',
    te: 'ప్రియమైన తల్లిదండ్రులారా, మీ బిడ్డ {{studentName}} ఈరోజు మధ్యాహ్నం పూట సెషన్‌కు హాజరుకాలేదు. ఒకవేళ ముందస్తు సమాచారం లేకపోతే దయచేసి పాఠశాలను సంప్రదించండి. ధన్యవాదాలు.'
  },
  feeReminder: {
    en: 'Dear Parent, this is a reminder regarding the outstanding fees of ₹{{amount}} for your ward {{studentName}}. Please clear the dues at your earliest convenience.',
    te: 'ప్రియమైన తల్లిదండ్రులారా, మీ బిడ్డ {{studentName}} కి సంబంధించిన ₹{{amount}} ఫీజు బకాయిల కొరకు ఈ రిమైండర్. దయచేసి వీలైనంత త్వరగా బకాయిలను చెల్లించండి.'
  },
  installmentReminder: {
    en: 'Dear Parent, installment #{{installmentNo}} of ₹{{amount}} for your ward {{studentName}} is due on {{dueDate}}. Kindly pay before the due date. Thank you.',
    te: 'ప్రియమైన తల్లిదండ్రులారా, మీ బిడ్డ {{studentName}} కి సంబంధించిన ₹{{amount}} యొక్క వాయిదా #{{installmentNo}} తేదీ {{dueDate}} న చెల్లించాల్సి ఉంది. దయచేసి గడువులోపు చెల్లించండి. ధన్యవాదాలు.'
  },
  installmentOverdue: {
    en: 'Dear Parent, installment #{{installmentNo}} of ₹{{amount}} for your ward {{studentName}} was due on {{dueDate}} and is now overdue. Please clear the dues at the earliest. Thank you.',
    te: 'ప్రియమైన తల్లిదండ్రులారా, మీ బిడ్డ {{studentName}} కి సంబంధించిన ₹{{amount}} యొక్క వాయిదా #{{installmentNo}} తేదీ {{dueDate}} నాటికే చెల్లించాల్సి ఉంది మరియు ప్రస్తుతం గడువు దాటిపోయింది. దయచేసి వీలైనంత త్వరగా చెల్లించండి. ధన్యవాదాలు.'
  }
};

const CONFIG_KEY = 'messageTemplates';
const CACHE_TTL_MS = 60 * 1000;

let cachedOverrides: Record<string, Partial<Record<TemplateLanguage, string>>> | null = null;
let cachedAt = 0;

async function getOverrides(): Promise<Record<string, Partial<Record<TemplateLanguage, string>>>> {
  if (cachedOverrides && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedOverrides;
  }
  try {
    const config = await SystemConfig.findOne({ key: CONFIG_KEY });
    cachedOverrides = (config?.value as any) || {};
    cachedAt = Date.now();
    return cachedOverrides!;
  } catch (err) {
    console.error('[Templates] Failed to load overrides, using defaults:', err);
    return {};
  }
}

export const invalidateTemplateCache = () => {
  cachedOverrides = null;
};

function fillPlaceholders(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, name) => vars[name] ?? '');
}

/**
 * Renders a bilingual message template (English + Telugu).
 */
export async function renderTemplate(
  key: string,
  lang: TemplateLanguage | undefined,
  vars: Record<string, string>
): Promise<string> {
  const overrides = await getOverrides();
  
  // Render English
  const englishTemplate = overrides[key]?.en || DEFAULT_TEMPLATES[key]?.en || '';
  const englishText = fillPlaceholders(englishTemplate, vars);
  
  // Render Telugu
  const teluguTemplate = overrides[key]?.te || DEFAULT_TEMPLATES[key]?.te || '';
  const teluguText = fillPlaceholders(teluguTemplate, vars);
  
  if (englishText && teluguText) {
    return `${englishText}\n\n${teluguText}`;
  }
  
  return englishText || teluguText || '';
}
