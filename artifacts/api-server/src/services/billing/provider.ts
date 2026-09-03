export type PaymentSetupUnavailable = { ok: false; code: "PAYMENT_SETUP_UNAVAILABLE"; message: string };
export type ProviderResult = PaymentSetupUnavailable | { ok: true; url?: string; status?: string };

export interface BillingProvider {
  createCheckoutSession(input: { companyId: number; ownerUserId: string; planCode: string; addOnCodes: string[] }): Promise<ProviderResult>;
  createCustomerPortalSession(input: { companyId: number; ownerUserId: string }): Promise<ProviderResult>;
  getSubscriptionStatus(input: { companyId: number; ownerUserId: string }): Promise<ProviderResult>;
  cancelSubscription(input: { companyId: number; ownerUserId: string }): Promise<ProviderResult>;
  syncSubscription(input: { companyId: number; ownerUserId: string }): Promise<ProviderResult>;
  verifyWebhook(input: { payload: Buffer; signature?: string }): Promise<ProviderResult>;
}

const unavailable = (): PaymentSetupUnavailable => ({
  ok: false,
  code: "PAYMENT_SETUP_UNAVAILABLE",
  message: "Payments are not configured yet. No payment or subscription was created.",
});

/** Deliberately the only provider registered until a real provider is integrated. */
export class UnavailableBillingProvider implements BillingProvider {
  async createCheckoutSession(): Promise<ProviderResult> { return unavailable(); }
  async createCustomerPortalSession(): Promise<ProviderResult> { return unavailable(); }
  async getSubscriptionStatus(): Promise<ProviderResult> { return unavailable(); }
  async cancelSubscription(): Promise<ProviderResult> { return unavailable(); }
  async syncSubscription(): Promise<ProviderResult> { return unavailable(); }
  async verifyWebhook(): Promise<ProviderResult> { return unavailable(); }
}

export const billingProvider: BillingProvider = new UnavailableBillingProvider();