/**
 * buildWhatsAppInsights / toggle helpers / pricing ledger tests.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WhatsAppMessage } from '../../models/whatsappMessage.model';
import { SystemConfig } from '../../models/systemConfig.model';
import {
  buildWhatsAppInsights,
  buildAdminWhatsAppInsights,
  isWhatsAppInsightsEnabled,
  setWhatsAppInsightsEnabled,
  updateWhatsAppPricing,
  resetWhatsAppBillingCycle,
  WHATSAPP_INSIGHTS_TOGGLE_KEY,
  WHATSAPP_BILLING_RESET_KEY,
  WHATSAPP_PRICING_LEDGER_KEY
} from '../whatsappInsights.service';

const leanResult = (value: any) => ({ lean: () => Promise.resolve(value) } as any);

afterEach(() => {
  vi.restoreAllMocks();
});

describe('buildWhatsAppInsights', () => {
  beforeEach(() => {
    vi.spyOn(WhatsAppMessage, 'aggregate').mockImplementation(((pipeline: any[]) => {
      const groupStage = pipeline[pipeline.length - 1].$group;
      if (groupStage._id === '$templateName') {
        return Promise.resolve([
          { _id: 'attendance_alert_full', count: 10 },
          { _id: 'fee_receipt', count: 5 },
          { _id: 'event_announcement', count: 8 },
          { _id: 'event_announcement_media', count: 2 },
          { _id: null, count: 3 } // free-form, no template
        ]);
      }
      // status grouping
      return Promise.resolve([
        { _id: 'sent', count: 25 },
        { _id: 'failed', count: 3 }
      ]);
    }) as any);
    vi.spyOn(WhatsAppMessage, 'countDocuments').mockResolvedValue(28 as any);
    // No superadmin-configured base price yet -> falls back to defaults
    vi.spyOn(SystemConfig, 'findOne').mockReturnValue(leanResult(null));
  });

  it('splits templates into UTILITY vs MARKETING using the Meta-verified category, not the internal registry category', async () => {
    const insights = await buildWhatsAppInsights();

    const utility = insights.categories.find((c) => c.category === 'UTILITY')!;
    const marketing = insights.categories.find((c) => c.category === 'MARKETING')!;

    expect(utility.totalCount).toBe(15); // attendance_alert_full(10) + fee_receipt(5)
    expect(marketing.totalCount).toBe(10); // event_announcement(8) + event_announcement_media(2)
    expect(insights.uncategorized.totalCount).toBe(3); // free-form messages
    expect(insights.totalMessages).toBe(28);
    expect(insights.byStatus).toEqual({ sent: 25, failed: 3 });
  });

  it('applies a 70% markup to the UTILITY base price and 30% to MARKETING, per the requested pricing rule', async () => {
    const insights = await buildWhatsAppInsights();

    const utility = insights.categories.find((c) => c.category === 'UTILITY')!;
    const marketing = insights.categories.find((c) => c.category === 'MARKETING')!;

    expect(utility.markupPercent).toBe(70);
    expect(utility.unitPrice).toBeCloseTo(utility.basePrice * 1.7, 4);

    expect(marketing.markupPercent).toBe(30);
    expect(marketing.unitPrice).toBeCloseTo(marketing.basePrice * 1.3, 4);
  });

  it('reads a superadmin-configured base price instead of the built-in default when one exists', async () => {
    (SystemConfig.findOne as any).mockImplementation((filter: any) => {
      if (filter.key === 'whatsappBaseUtilityPrice') return leanResult({ value: 1 });
      return leanResult(null);
    });

    const insights = await buildWhatsAppInsights();
    const utility = insights.categories.find((c) => c.category === 'UTILITY')!;

    expect(utility.basePrice).toBe(1);
    expect(utility.unitPrice).toBeCloseTo(1.7, 4);
  });
});

describe('buildAdminWhatsAppInsights', () => {
  beforeEach(() => {
    vi.spyOn(WhatsAppMessage, 'aggregate').mockImplementation(((pipeline: any[]) => {
      const groupStage = pipeline[pipeline.length - 1].$group;
      if (groupStage._id === '$templateName') {
        return Promise.resolve([
          { _id: 'attendance_alert_full', count: 10 },
          { _id: 'fee_receipt', count: 5 },
          { _id: 'event_announcement', count: 8 },
          { _id: 'event_announcement_media', count: 2 },
          { _id: null, count: 3 }
        ]);
      }
      return Promise.resolve([
        { _id: 'sent', count: 25 },
        { _id: 'failed', count: 3 }
      ]);
    }) as any);
    vi.spyOn(WhatsAppMessage, 'countDocuments').mockResolvedValue(28 as any);
    vi.spyOn(SystemConfig, 'findOne').mockReturnValue(leanResult(null));
  });

  it('omits basePrice, markupPercent, and unitPrice from the admin response payload', async () => {
    const adminInsights = await buildAdminWhatsAppInsights();

    for (const cat of adminInsights.categories) {
      expect((cat as any).basePrice).toBeUndefined();
      expect((cat as any).markupPercent).toBeUndefined();
      expect((cat as any).unitPrice).toBeUndefined();
      expect(typeof cat.totalCost).toBe('number');
      expect(cat.totalCost).toBeGreaterThan(0);
    }
  });

  it('calculates total estimated cost as sum of inflated category costs', async () => {
    const adminInsights = await buildAdminWhatsAppInsights();
    const sumOfCats = adminInsights.categories.reduce((acc, c) => acc + c.totalCost, 0);

    expect(adminInsights.totalEstimatedCost).toBeCloseTo(sumOfCats, 2);
    expect(adminInsights.totalMessages).toBe(28);
    expect(adminInsights.byStatus).toEqual({ sent: 25, failed: 3 });
  });
});

describe('whatsapp insights toggle, markup update, and reset', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('defaults to disabled when no config document exists', async () => {
    vi.spyOn(SystemConfig, 'findOne').mockReturnValue(leanResult(null));
    await expect(isWhatsAppInsightsEnabled()).resolves.toBe(false);
  });

  it('reports enabled once explicitly set true', async () => {
    vi.spyOn(SystemConfig, 'findOne').mockReturnValue(leanResult({ value: true }));
    await expect(isWhatsAppInsightsEnabled()).resolves.toBe(true);
  });

  it('persists the toggle under the documented SystemConfig key', async () => {
    const upsertSpy = vi.spyOn(SystemConfig, 'findOneAndUpdate').mockResolvedValue({} as any);
    await setWhatsAppInsightsEnabled(true);
    expect(upsertSpy).toHaveBeenCalledWith(
      { key: WHATSAPP_INSIGHTS_TOGGLE_KEY },
      { key: WHATSAPP_INSIGHTS_TOGGLE_KEY, value: true },
      { upsert: true }
    );
  });

  it('updates markup percentages and records pricing ledger period', async () => {
    const upsertSpy = vi.spyOn(SystemConfig, 'findOneAndUpdate').mockResolvedValue({} as any);
    vi.spyOn(SystemConfig, 'findOne').mockReturnValue(leanResult(null));

    await updateWhatsAppPricing({ utilityMarkupPercent: 85, marketingMarkupPercent: 40 });

    expect(upsertSpy).toHaveBeenCalledWith(
      { key: 'whatsappUtilityMarkupPercent' },
      { key: 'whatsappUtilityMarkupPercent', value: 85 },
      { upsert: true }
    );
    expect(upsertSpy).toHaveBeenCalledWith(
      { key: 'whatsappMarketingMarkupPercent' },
      { key: 'whatsappMarketingMarkupPercent', value: 40 },
      { upsert: true }
    );
    expect(upsertSpy).toHaveBeenCalledWith(
      { key: WHATSAPP_PRICING_LEDGER_KEY },
      expect.objectContaining({ key: WHATSAPP_PRICING_LEDGER_KEY }),
      { upsert: true }
    );
  });

  it('resets billing cycle timestamp and initializes fresh ledger starting from now', async () => {
    const upsertSpy = vi.spyOn(SystemConfig, 'findOneAndUpdate').mockResolvedValue({} as any);
    vi.spyOn(SystemConfig, 'findOne').mockReturnValue(leanResult(null));

    await resetWhatsAppBillingCycle();

    expect(upsertSpy).toHaveBeenCalledWith(
      { key: WHATSAPP_BILLING_RESET_KEY },
      expect.objectContaining({ key: WHATSAPP_BILLING_RESET_KEY }),
      { upsert: true }
    );
    expect(upsertSpy).toHaveBeenCalledWith(
      { key: WHATSAPP_PRICING_LEDGER_KEY },
      expect.objectContaining({ key: WHATSAPP_PRICING_LEDGER_KEY }),
      { upsert: true }
    );
  });
});
