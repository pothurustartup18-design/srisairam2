import { WhatsAppMessage } from '../models/whatsappMessage.model';
import { SystemConfig } from '../models/systemConfig.model';

/**
 * Meta message category per approved template, per the live-verified categories
 * documented in config/whatsappTemplates.ts (checked against the WABA's
 * GET /message_templates response). Not re-derived from that registry's own
 * `category` field because that field is our internal grouping (attendance/
 * fees/reports/announcements/transport), not Meta's UTILITY/MARKETING label.
 */
export const META_CATEGORY_BY_TEMPLATE: Record<string, 'UTILITY' | 'MARKETING'> = {
  attendance_alert_full: 'UTILITY',
  attendance_alert_morning: 'UTILITY',
  attendance_alert_afternoon: 'UTILITY',
  fee_receipt: 'UTILITY',
  report_card_notice: 'UTILITY',
  installment_overdue: 'UTILITY',
  installment_reminder: 'UTILITY',
  transport_bus_alert: 'UTILITY',
  announcement_broadcast: 'MARKETING',
  event_announcement: 'MARKETING',
  event_announcement_media: 'MARKETING',
  staff_credentials_new: 'UTILITY',
  staff_credentials_reset: 'UTILITY'
  // o_auth is AUTHENTICATION-category, which this map (and the pricing tiers
  // in DEFAULT_BASE_PRICE below) don't model yet — it falls into "OTHER" in
  // cost reporting until an AUTHENTICATION pricing tier is added.
};

const DEFAULT_BASE_PRICE = {
  UTILITY: 0.1651,
  MARKETING: 0.7987
} as const;

const DEFAULT_MARKUP_PERCENT = {
  UTILITY: 70,
  MARKETING: 30
} as const;

const BASE_PRICE_CONFIG_KEY: Record<'UTILITY' | 'MARKETING', string> = {
  UTILITY: 'whatsappBaseUtilityPrice',
  MARKETING: 'whatsappBaseMarketingPrice'
};

const MARKUP_PERCENT_CONFIG_KEY: Record<'UTILITY' | 'MARKETING', string> = {
  UTILITY: 'whatsappUtilityMarkupPercent',
  MARKETING: 'whatsappMarketingMarkupPercent'
};

export const WHATSAPP_INSIGHTS_TOGGLE_KEY = 'whatsappInsightsEnabled';
export const WHATSAPP_BILLING_RESET_KEY = 'whatsappBillingResetAt';
export const WHATSAPP_PRICING_LEDGER_KEY = 'whatsappPricingLedger';

export async function getBasePrice(category: 'UTILITY' | 'MARKETING'): Promise<number> {
  const config = await SystemConfig.findOne({ key: BASE_PRICE_CONFIG_KEY[category] }).lean();
  const value = Number(config?.value);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_BASE_PRICE[category];
}

export async function getMarkupPercent(category: 'UTILITY' | 'MARKETING'): Promise<number> {
  const config = await SystemConfig.findOne({ key: MARKUP_PERCENT_CONFIG_KEY[category] }).lean();
  const value = Number(config?.value);
  return Number.isFinite(value) && value >= 0 ? value : DEFAULT_MARKUP_PERCENT[category];
}

export interface PricingPeriod {
  effectiveFrom: string;
  effectiveTo?: string | null;
  utilityBasePrice: number;
  utilityMarkupPercent: number;
  utilityUnitPrice: number;
  marketingBasePrice: number;
  marketingMarkupPercent: number;
  marketingUnitPrice: number;
}

export async function getPricingLedger(): Promise<PricingPeriod[]> {
  const config = await SystemConfig.findOne({ key: WHATSAPP_PRICING_LEDGER_KEY }).lean();
  if (Array.isArray(config?.value)) {
    return config.value as PricingPeriod[];
  }
  return [];
}

export async function getBillingResetAt(): Promise<string | null> {
  const config = await SystemConfig.findOne({ key: WHATSAPP_BILLING_RESET_KEY }).lean();
  return typeof config?.value === 'string' ? config.value : null;
}

export async function updateWhatsAppPricing(params: {
  utilityMarkupPercent?: number;
  marketingMarkupPercent?: number;
  utilityBasePrice?: number;
  marketingBasePrice?: number;
}): Promise<void> {
  const now = new Date().toISOString();

  if (typeof params.utilityMarkupPercent === 'number' && Number.isFinite(params.utilityMarkupPercent) && params.utilityMarkupPercent >= 0) {
    await SystemConfig.findOneAndUpdate(
      { key: MARKUP_PERCENT_CONFIG_KEY.UTILITY },
      { key: MARKUP_PERCENT_CONFIG_KEY.UTILITY, value: params.utilityMarkupPercent },
      { upsert: true }
    );
  }

  if (typeof params.marketingMarkupPercent === 'number' && Number.isFinite(params.marketingMarkupPercent) && params.marketingMarkupPercent >= 0) {
    await SystemConfig.findOneAndUpdate(
      { key: MARKUP_PERCENT_CONFIG_KEY.MARKETING },
      { key: MARKUP_PERCENT_CONFIG_KEY.MARKETING, value: params.marketingMarkupPercent },
      { upsert: true }
    );
  }

  if (typeof params.utilityBasePrice === 'number' && Number.isFinite(params.utilityBasePrice) && params.utilityBasePrice > 0) {
    await SystemConfig.findOneAndUpdate(
      { key: BASE_PRICE_CONFIG_KEY.UTILITY },
      { key: BASE_PRICE_CONFIG_KEY.UTILITY, value: params.utilityBasePrice },
      { upsert: true }
    );
  }

  if (typeof params.marketingBasePrice === 'number' && Number.isFinite(params.marketingBasePrice) && params.marketingBasePrice > 0) {
    await SystemConfig.findOneAndUpdate(
      { key: BASE_PRICE_CONFIG_KEY.MARKETING },
      { key: BASE_PRICE_CONFIG_KEY.MARKETING, value: params.marketingBasePrice },
      { upsert: true }
    );
  }

  const [utilityBasePrice, marketingBasePrice, utilityMarkupPercent, marketingMarkupPercent] = await Promise.all([
    getBasePrice('UTILITY'),
    getBasePrice('MARKETING'),
    getMarkupPercent('UTILITY'),
    getMarkupPercent('MARKETING')
  ]);

  const utilityUnitPrice = Number((utilityBasePrice * (1 + utilityMarkupPercent / 100)).toFixed(4));
  const marketingUnitPrice = Number((marketingBasePrice * (1 + marketingMarkupPercent / 100)).toFixed(4));

  const currentLedger = await getPricingLedger();
  const resetAt = await getBillingResetAt();

  const newPeriod: PricingPeriod = {
    effectiveFrom: now,
    effectiveTo: null,
    utilityBasePrice,
    utilityMarkupPercent,
    utilityUnitPrice,
    marketingBasePrice,
    marketingMarkupPercent,
    marketingUnitPrice
  };

  let updatedLedger: PricingPeriod[] = [];
  if (currentLedger.length === 0) {
    const initialPeriod: PricingPeriod = {
      effectiveFrom: resetAt || new Date(0).toISOString(),
      effectiveTo: now,
      utilityBasePrice,
      utilityMarkupPercent,
      utilityUnitPrice,
      marketingBasePrice,
      marketingMarkupPercent,
      marketingUnitPrice
    };
    updatedLedger = [initialPeriod, newPeriod];
  } else {
    updatedLedger = currentLedger.map((period, idx) => {
      if (idx === currentLedger.length - 1 && !period.effectiveTo) {
        return { ...period, effectiveTo: now };
      }
      return period;
    });
    updatedLedger.push(newPeriod);
  }

  await SystemConfig.findOneAndUpdate(
    { key: WHATSAPP_PRICING_LEDGER_KEY },
    { key: WHATSAPP_PRICING_LEDGER_KEY, value: updatedLedger },
    { upsert: true }
  );
}

export async function resetWhatsAppBillingCycle(): Promise<void> {
  const now = new Date().toISOString();
  await SystemConfig.findOneAndUpdate(
    { key: WHATSAPP_BILLING_RESET_KEY },
    { key: WHATSAPP_BILLING_RESET_KEY, value: now },
    { upsert: true }
  );

  const [utilityBasePrice, marketingBasePrice, utilityMarkupPercent, marketingMarkupPercent] = await Promise.all([
    getBasePrice('UTILITY'),
    getBasePrice('MARKETING'),
    getMarkupPercent('UTILITY'),
    getMarkupPercent('MARKETING')
  ]);

  const utilityUnitPrice = Number((utilityBasePrice * (1 + utilityMarkupPercent / 100)).toFixed(4));
  const marketingUnitPrice = Number((marketingBasePrice * (1 + marketingMarkupPercent / 100)).toFixed(4));

  const freshLedger: PricingPeriod[] = [
    {
      effectiveFrom: now,
      effectiveTo: null,
      utilityBasePrice,
      utilityMarkupPercent,
      utilityUnitPrice,
      marketingBasePrice,
      marketingMarkupPercent,
      marketingUnitPrice
    }
  ];

  await SystemConfig.findOneAndUpdate(
    { key: WHATSAPP_PRICING_LEDGER_KEY },
    { key: WHATSAPP_PRICING_LEDGER_KEY, value: freshLedger },
    { upsert: true }
  );
}

export interface TemplateBreakdown {
  templateName: string;
  category: 'UTILITY' | 'MARKETING' | 'OTHER';
  count: number;
}

export interface CategoryInsight {
  category: 'UTILITY' | 'MARKETING';
  templates: TemplateBreakdown[];
  totalCount: number;
  basePrice: number;
  markupPercent: number;
  unitPrice: number;
  estimatedCost: number;
}

export interface WhatsAppInsights {
  generatedAt: string;
  billingResetAt: string | null;
  totalMessages: number;
  byStatus: Record<string, number>;
  categories: CategoryInsight[];
  uncategorized: { totalCount: number; templates: TemplateBreakdown[] };
  pricingLedger: PricingPeriod[];
}

export async function buildWhatsAppInsights(): Promise<WhatsAppInsights> {
  const [resetAtStr, ledger, basePriceUtility, basePriceMarketing, markupUtility, markupMarketing] = await Promise.all([
    getBillingResetAt(),
    getPricingLedger(),
    getBasePrice('UTILITY'),
    getBasePrice('MARKETING'),
    getMarkupPercent('UTILITY'),
    getMarkupPercent('MARKETING')
  ]);

  const matchFilter: any = {};
  if (resetAtStr) {
    matchFilter.createdAt = { $gte: new Date(resetAtStr) };
  }

  const [templateCounts, statusCounts, totalMessages] = await Promise.all([
    WhatsAppMessage.aggregate([
      { $match: matchFilter },
      { $group: { _id: '$templateName', count: { $sum: 1 } } }
    ]),
    WhatsAppMessage.aggregate([
      { $match: matchFilter },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]),
    WhatsAppMessage.countDocuments(matchFilter)
  ]);

  const byStatus: Record<string, number> = {};
  for (const row of statusCounts) {
    byStatus[row._id || 'unknown'] = row.count;
  }

  const grouped: Record<'UTILITY' | 'MARKETING' | 'OTHER', TemplateBreakdown[]> = {
    UTILITY: [],
    MARKETING: [],
    OTHER: []
  };

  for (const row of templateCounts) {
    const templateName: string = row._id || '(free-form / no template)';
    const category: 'UTILITY' | 'MARKETING' | 'OTHER' = (row._id && META_CATEGORY_BY_TEMPLATE[row._id]) || 'OTHER';
    grouped[category].push({ templateName, category, count: row.count });
  }

  // Cost calculation with pricing ledger support (historical rate preservation)
  let utilityEstimatedCost = 0;
  let marketingEstimatedCost = 0;

  if (ledger.length > 0) {
    for (const period of ledger) {
      const from = new Date(period.effectiveFrom);
      const to = period.effectiveTo ? new Date(period.effectiveTo) : null;

      const periodFilter: any = {
        ...matchFilter,
        createdAt: {
          $gte: resetAtStr && new Date(resetAtStr) > from ? new Date(resetAtStr) : from,
          ...(to ? { $lt: to } : {})
        }
      };

      const periodTemplateCounts = await WhatsAppMessage.aggregate([
        { $match: periodFilter },
        { $group: { _id: '$templateName', count: { $sum: 1 } } }
      ]);

      for (const row of periodTemplateCounts) {
        const cat = (row._id && META_CATEGORY_BY_TEMPLATE[row._id]) || 'OTHER';
        if (cat === 'UTILITY') {
          utilityEstimatedCost += row.count * period.utilityUnitPrice;
        } else if (cat === 'MARKETING') {
          marketingEstimatedCost += row.count * period.marketingUnitPrice;
        }
      }
    }
  } else {
    const currentUnitPriceUtility = Number((basePriceUtility * (1 + markupUtility / 100)).toFixed(4));
    const currentUnitPriceMarketing = Number((basePriceMarketing * (1 + markupMarketing / 100)).toFixed(4));
    const totalUtilCount = grouped.UTILITY.reduce((sum, t) => sum + t.count, 0);
    const totalMktCount = grouped.MARKETING.reduce((sum, t) => sum + t.count, 0);
    utilityEstimatedCost = totalUtilCount * currentUnitPriceUtility;
    marketingEstimatedCost = totalMktCount * currentUnitPriceMarketing;
  }

  const currentUnitPriceUtility = Number((basePriceUtility * (1 + markupUtility / 100)).toFixed(4));
  const currentUnitPriceMarketing = Number((basePriceMarketing * (1 + markupMarketing / 100)).toFixed(4));

  const buildCategory = (category: 'UTILITY' | 'MARKETING'): CategoryInsight => {
    const templates = grouped[category].sort((a, b) => b.count - a.count);
    const totalCount = templates.reduce((sum, t) => sum + t.count, 0);
    const basePrice = category === 'UTILITY' ? basePriceUtility : basePriceMarketing;
    const markupPercent = category === 'UTILITY' ? markupUtility : markupMarketing;
    const unitPrice = category === 'UTILITY' ? currentUnitPriceUtility : currentUnitPriceMarketing;
    const estimatedCost = category === 'UTILITY'
      ? Number(utilityEstimatedCost.toFixed(2))
      : Number(marketingEstimatedCost.toFixed(2));

    return {
      category,
      templates,
      totalCount,
      basePrice,
      markupPercent,
      unitPrice,
      estimatedCost
    };
  };

  const uncategorizedTemplates = grouped.OTHER.sort((a, b) => b.count - a.count);

  return {
    generatedAt: new Date().toISOString(),
    billingResetAt: resetAtStr,
    totalMessages,
    byStatus,
    categories: [buildCategory('UTILITY'), buildCategory('MARKETING')],
    uncategorized: {
      totalCount: uncategorizedTemplates.reduce((sum, t) => sum + t.count, 0),
      templates: uncategorizedTemplates
    },
    pricingLedger: ledger
  };
}

export interface AdminCategoryInsight {
  category: 'UTILITY' | 'MARKETING';
  totalCount: number;
  totalCost: number;
  templates: {
    templateName: string;
    count: number;
  }[];
}

export interface AdminWhatsAppInsights {
  generatedAt: string;
  billingResetAt: string | null;
  totalMessages: number;
  byStatus: Record<string, number>;
  totalEstimatedCost: number;
  categories: AdminCategoryInsight[];
  uncategorized: {
    totalCount: number;
    templates: { templateName: string; count: number }[];
  };
}

export async function buildAdminWhatsAppInsights(): Promise<AdminWhatsAppInsights> {
  const fullInsights = await buildWhatsAppInsights();
  const totalEstimatedCost = Number(
    fullInsights.categories.reduce((acc, cat) => acc + cat.estimatedCost, 0).toFixed(2)
  );

  return {
    generatedAt: fullInsights.generatedAt,
    billingResetAt: fullInsights.billingResetAt,
    totalMessages: fullInsights.totalMessages,
    byStatus: fullInsights.byStatus,
    totalEstimatedCost,
    categories: fullInsights.categories.map((c) => ({
      category: c.category,
      totalCount: c.totalCount,
      totalCost: c.estimatedCost,
      templates: c.templates.map((t) => ({
        templateName: t.templateName,
        count: t.count
      }))
    })),
    uncategorized: {
      totalCount: fullInsights.uncategorized.totalCount,
      templates: fullInsights.uncategorized.templates.map((t) => ({
        templateName: t.templateName,
        count: t.count
      }))
    }
  };
}

export async function isWhatsAppInsightsEnabled(): Promise<boolean> {
  const config = await SystemConfig.findOne({ key: WHATSAPP_INSIGHTS_TOGGLE_KEY }).lean();
  return config?.value === true;
}

export async function setWhatsAppInsightsEnabled(enabled: boolean): Promise<void> {
  await SystemConfig.findOneAndUpdate(
    { key: WHATSAPP_INSIGHTS_TOGGLE_KEY },
    { key: WHATSAPP_INSIGHTS_TOGGLE_KEY, value: !!enabled },
    { upsert: true }
  );
}
