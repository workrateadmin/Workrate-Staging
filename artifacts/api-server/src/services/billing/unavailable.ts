import type { BillingProvider, PaymentSetupUnavailable, ProviderResult } from "./provider";

export const unavailable = (): PaymentSetupUnavailable => ({
  ok: false,
  code: "PAYMENT_SETUP_UNAVAILABLE",
  message: "Payments are not configured yet. No payment or subscription was created.",
});

export class UnavailableBillingProvider implements BillingProvider {
  async createCheckoutSession(): Promise<ProviderResult> { return unavailable(); } async createCustomerPortalSession(): Promise<ProviderResult> { return unavailable(); }
  async getSubscriptionStatus(): Promise<ProviderResult> { return unavailable(); } async cancelSubscription(): Promise<ProviderResult> { return unavailable(); }
  async syncSubscription(): Promise<ProviderResult> { return unavailable(); } async verifyWebhook(): Promise<ProviderResult> { return unavailable(); }
  async applySelection(): Promise<ProviderResult> { return unavailable(); }
}