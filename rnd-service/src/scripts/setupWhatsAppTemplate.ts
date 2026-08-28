/**
 * Verifies (and creates if missing) the approved "fallback" WhatsApp template
 * that whatsapp.service.ts uses to re-open a closed 24-hour session window
 * (Meta error 131047). Free-form messages only deliver within 24h of the
 * customer's last message — outside that window an approved template is required.
 *
 * Runs automatically at server startup, or manually:
 *   npm run setup:whatsapp-template
 *
 * Template approval status is visible at business.facebook.com > WhatsApp
 * Manager > Message Templates. Name/language come from
 * WHATSAPP_FALLBACK_TEMPLATE_NAME / WHATSAPP_FALLBACK_TEMPLATE_LANG.
 */
import 'dotenv/config';
import { resolveTenantConfig } from '../config/whatsapp';

export const setupTemplate = async (): Promise<void> => {
  const config = resolveTenantConfig();
  if (!config) {
    console.warn('[WhatsApp Template] Simulation mode — skipping fallback template check.');
    return;
  }

  const { apiVersion, businessAccountId, accessToken, fallbackTemplateName, fallbackTemplateLang } = config;
  const baseUrl = `https://graph.facebook.com/${apiVersion}/${businessAccountId}/message_templates`;

  try {
    // 1) Check whether the template already exists and report its review status.
    const checkResponse = await fetch(`${baseUrl}?name=${encodeURIComponent(fallbackTemplateName)}&limit=25`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const checkData: any = await checkResponse.json();

    if (checkResponse.ok) {
      const existing = (checkData.data || []).find(
        (t: any) => t.name === fallbackTemplateName && t.language === fallbackTemplateLang
      );
      if (existing) {
        const status = existing.status || 'UNKNOWN';
        if (status === 'APPROVED') {
          console.log(`[WhatsApp Template] Fallback template "${fallbackTemplateName}" (${fallbackTemplateLang}) is APPROVED and ready.`);
        } else {
          console.warn(
            `[WhatsApp Template] Fallback template "${fallbackTemplateName}" exists but status is ${status}. ` +
              'Messages outside the 24h window will fail until it is APPROVED (check WhatsApp Manager > Message Templates).'
          );
        }
        return;
      }
    } else {
      console.warn('[WhatsApp Template] Could not list templates:', JSON.stringify(checkData?.error || checkData));
    }

    // 2) Not found — submit it for review.
    console.log(`[WhatsApp Template] Creating fallback template "${fallbackTemplateName}" (${fallbackTemplateLang})...`);
    const createResponse = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: fallbackTemplateName,
        language: fallbackTemplateLang,
        category: 'UTILITY',
        components: [
          {
            type: 'BODY',
            text: 'School Update Notification: Dear Parent/Teacher, this is an important message from School ERP: {{1}}. Please contact the administration if you have any questions.',
            example: { body_text: [['Your ward was marked absent today.']] }
          }
        ]
      })
    });
    const createData: any = await createResponse.json();

    if (createResponse.ok) {
      console.log(`[WhatsApp Template] Fallback template "${fallbackTemplateName}" submitted for review (usually approved within minutes to hours).`);
    } else if (
      createData?.error?.error_subcode === 2388023 ||
      createData?.error?.error_subcode === 2388024 ||
      /already exists/i.test(createData?.error?.message || '')
    ) {
      console.log(`[WhatsApp Template] Fallback template "${fallbackTemplateName}" already exists.`);
    } else {
      console.error('[WhatsApp Template] Registration failed:', JSON.stringify(createData, null, 2));
    }
  } catch (err) {
    console.error('[WhatsApp Template] Failed to check/register fallback template:', err);
  }
};

if (require.main === module) {
  setupTemplate().then(() => process.exit(0)).catch((err) => {
    console.error('Unexpected error creating WhatsApp template:', err);
    process.exit(1);
  });
}
