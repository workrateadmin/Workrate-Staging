/**
 * Customer Communications Service
 * Reusable service for sending emails and SMS to customers.
 * Currently supports: enquiry confirmation, proposal email.
 *
 * Email provider: Resend (via RESEND_API_KEY env var)
 * SMS provider: not yet connected — framework ready for Twilio
 */

import { db, enquiriesTable, quotesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

// ── Types ────────────────────────────────────────────────────────────────────

type CommStatus = "sent" | "failed" | "not_configured" | "disabled" | "no_recipient";

export interface CommResult {
  emailStatus: CommStatus;
  smsStatus: CommStatus;
  emailError?: string;
}

interface CompanyBranding {
  name: string;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  logoUrl?: string | null;
  brandColourPrimary?: string | null;
  notificationsFromEmail?: string | null;
  enquiryConfirmationEnabled?: boolean | null;
  enquiryEmailEnabled?: boolean | null;
  enquirySmsEnabled?: boolean | null;
  enquiryConfirmationMessage?: string | null;
  proposalEmailEnabled?: boolean | null;
  bankPaymentDetails?: string | null;
  paymentTerms?: string | null;
}

// ── Email provider ────────────────────────────────────────────────────────────

// WorkRate sends all transactional email from a single verified domain.
// Individual businesses are identified by display name and reply-to only.
const WORKRATE_FROM_EMAIL = "notifications@work-rate.uk";

async function sendViaResend(opts: {
  to: string;
  fromName: string;
  replyTo?: string;
  subject: string;
  html: string;
}): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "RESEND_API_KEY not configured" };
  }

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);
    const result = await resend.emails.send({
      from: `${opts.fromName} <${WORKRATE_FROM_EMAIL}>`,
      to: [opts.to],
      replyTo: opts.replyTo || undefined,
      subject: opts.subject,
      html: opts.html,
    });
    if (result.error) {
      return { ok: false, error: result.error.message ?? "Unknown Resend error" };
    }
    return { ok: true, messageId: result.data?.id };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? String(err) };
  }
}

// ── Email templates ───────────────────────────────────────────────────────────

function primaryColour(company: CompanyBranding) {
  return company.brandColourPrimary ?? "#0d9488";
}

function buildEmailShell(opts: {
  company: CompanyBranding;
  preheader: string;
  body: string;
}): string {
  const { company, preheader, body } = opts;
  const colour = primaryColour(company);
  const logo = company.logoUrl
    ? `<img src="${company.logoUrl}" alt="${company.name}" style="max-height:48px;max-width:160px;object-fit:contain;display:block;margin:0 auto 4px;" />`
    : "";
  const footerParts: string[] = [company.name];
  if (company.phone) footerParts.push(company.phone);
  if (company.email) footerParts.push(`<a href="mailto:${company.email}" style="color:${colour};">${company.email}</a>`);
  if (company.website) footerParts.push(`<a href="${company.website}" style="color:${colour};">${company.website}</a>`);

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${company.name}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<span style="display:none;font-size:1px;color:#f4f4f5;max-height:0;overflow:hidden;">${preheader}</span>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
      <!-- Header -->
      <tr><td style="background:${colour};padding:28px 32px;text-align:center;">
        ${logo}
        <p style="margin:0;color:#ffffff;font-size:20px;font-weight:800;letter-spacing:-0.3px;">${company.name}</p>
      </td></tr>
      <!-- Body -->
      <tr><td style="padding:32px;">
        ${body}
      </td></tr>
      <!-- Footer -->
      <tr><td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 32px;text-align:center;">
        <p style="margin:0;font-size:12px;color:#6b7280;line-height:1.6;">${footerParts.join("&nbsp;&bull;&nbsp;")}</p>
        <p style="margin:8px 0 0;font-size:11px;color:#9ca3af;">Powered by WorkRate</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

const DEFAULT_ENQUIRY_MESSAGE =
  "We've received your enquiry and we'll be in touch as soon as possible to discuss your project. Our team typically responds within 1–2 business days.";

function buildEnquiryConfirmationHtml(opts: {
  customerFirstName: string;
  projectType: string | null;
  company: CompanyBranding;
}): string {
  const { customerFirstName, projectType, company } = opts;
  const message = company.enquiryConfirmationMessage || DEFAULT_ENQUIRY_MESSAGE;
  const colour = primaryColour(company);

  const body = `
    <p style="margin:0 0 16px;font-size:18px;font-weight:700;color:#111827;">Hi ${customerFirstName},</p>
    <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.6;">
      Thanks for getting in touch with <strong>${company.name}</strong>.
    </p>
    ${projectType ? `<div style="background:#f9fafb;border-left:4px solid ${colour};border-radius:4px;padding:14px 18px;margin:0 0 20px;">
      <p style="margin:0;font-size:13px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Your enquiry</p>
      <p style="margin:4px 0 0;font-size:15px;color:#111827;font-weight:600;">${projectType}</p>
    </div>` : ""}
    <p style="margin:0 0 28px;font-size:15px;color:#374151;line-height:1.6;">${message}</p>
    <p style="margin:0 0 8px;font-size:15px;color:#374151;line-height:1.6;">Thanks,<br /><strong>${company.name}</strong></p>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
    <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5;">
      If you have any questions before we respond, feel free to reply to this email.
    </p>
  `;

  return buildEmailShell({
    company,
    preheader: `Thanks for contacting ${company.name} — we've received your enquiry.`,
    body,
  });
}

function buildProposalEmailHtml(opts: {
  customerFirstName: string;
  projectType: string | null;
  totalWithVat: number;
  depositAmount: number | null;
  proposalUrl: string;
  company: CompanyBranding;
}): string {
  const { customerFirstName, projectType, totalWithVat, depositAmount, proposalUrl, company } = opts;
  const colour = primaryColour(company);
  const fmt = (n: number) =>
    new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(n);

  const body = `
    <p style="margin:0 0 16px;font-size:18px;font-weight:700;color:#111827;">Hi ${customerFirstName},</p>
    <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.6;">
      Your proposal from <strong>${company.name}</strong> is ready to view.
    </p>
    ${projectType ? `<div style="background:#f9fafb;border-left:4px solid ${colour};border-radius:4px;padding:14px 18px;margin:0 0 20px;">
      <p style="margin:0;font-size:13px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Project</p>
      <p style="margin:4px 0 0;font-size:15px;color:#111827;font-weight:600;">${projectType}</p>
    </div>` : ""}
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <tr>
        <td style="padding:14px 18px;background:#f9fafb;border-bottom:1px solid #e5e7eb;">
          <p style="margin:0;font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Proposal Total</p>
          <p style="margin:4px 0 0;font-size:22px;font-weight:800;color:#111827;">${fmt(totalWithVat)}</p>
        </td>
      </tr>
      ${depositAmount && depositAmount > 0 ? `<tr>
        <td style="padding:14px 18px;">
          <p style="margin:0;font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Deposit to Confirm</p>
          <p style="margin:4px 0 0;font-size:18px;font-weight:700;color:${colour};">${fmt(depositAmount)}</p>
        </td>
      </tr>` : ""}
    </table>
    <p style="text-align:center;margin:0 0 28px;">
      <a href="${proposalUrl}" style="display:inline-block;background:${colour};color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;padding:16px 40px;border-radius:10px;letter-spacing:-0.2px;">
        View Your Proposal →
      </a>
    </p>
    <p style="margin:0 0 24px;font-size:14px;color:#6b7280;text-align:center;line-height:1.5;">
      If you have any questions, you can reply to this email or use the<br />
      <strong>Ask a Question</strong> option inside your proposal.
    </p>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 20px;" />
    <p style="margin:0;font-size:13px;color:#9ca3af;text-align:center;line-height:1.5;">
      This proposal was sent by ${company.name}.
      ${company.email ? `<br />Reply to: <a href="mailto:${company.email}" style="color:${colour};">${company.email}</a>` : ""}
    </p>
  `;

  return buildEmailShell({
    company,
    preheader: `Your proposal from ${company.name} is ready — ${new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(totalWithVat)} total.`,
    body,
  });
}

// ── SMS (framework — no provider yet) ─────────────────────────────────────────

async function sendSms(_opts: {
  to: string;
  message: string;
}): Promise<{ ok: boolean; error?: string }> {
  // Twilio (or other provider) can be wired here later.
  // When TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are set, implement here.
  return { ok: false, error: "no_provider" };
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function sendEnquiryConfirmation(
  enquiryId: number,
  params: {
    customerName: string;
    customerEmail: string | null;
    customerPhone: string | null;
    projectType: string | null;
  },
  company: CompanyBranding
): Promise<CommResult> {
  const result: CommResult = {
    emailStatus: "pending" as any,
    smsStatus: "pending" as any,
  };

  // ── Email ──
  if (!(company.enquiryConfirmationEnabled ?? true)) {
    result.emailStatus = "disabled";
  } else if (!(company.enquiryEmailEnabled ?? true)) {
    result.emailStatus = "disabled";
  } else if (!params.customerEmail) {
    result.emailStatus = "no_recipient";
  } else if (!process.env.RESEND_API_KEY) {
    result.emailStatus = "not_configured";
  } else {
    const firstName = params.customerName?.split(" ")[0] ?? params.customerName;

    const html = buildEnquiryConfirmationHtml({
      customerFirstName: firstName,
      projectType: params.projectType,
      company,
    });

    const sent = await sendViaResend({
      to: params.customerEmail,
      fromName: `${company.name} via WorkRate`,
      replyTo: company.email ?? undefined,
      subject: `We've received your enquiry – ${company.name}`,
      html,
    });

    result.emailStatus = sent.ok ? "sent" : "failed";
    if (!sent.ok) result.emailError = sent.error;
  }

  // ── SMS ──
  if (!(company.enquiryConfirmationEnabled ?? true)) {
    result.smsStatus = "disabled";
  } else if (!(company.enquirySmsEnabled ?? false)) {
    result.smsStatus = "not_configured";
  } else if (!params.customerPhone) {
    result.smsStatus = "no_recipient";
  } else {
    const firstName = params.customerName?.split(" ")[0] ?? params.customerName;
    const smsResult = await sendSms({
      to: params.customerPhone,
      message: `Hi ${firstName}, thanks for contacting ${company.name}. We've received your enquiry about ${params.projectType ?? "your project"} and will be in touch soon.`,
    });
    if (!smsResult.ok && smsResult.error === "no_provider") {
      result.smsStatus = "not_configured";
    } else {
      result.smsStatus = smsResult.ok ? "sent" : "failed";
    }
  }

  // Persist status to DB (fire-and-forget safe — caller already has enquiry saved)
  const now = new Date();
  const updates: Record<string, any> = {
    confirmationEmailStatus: result.emailStatus,
    confirmationSmsStatus: result.smsStatus,
  };
  if (result.emailStatus === "sent") updates.confirmationEmailSentAt = now;
  if (result.smsStatus === "sent") updates.confirmationSmsSentAt = now;

  await db.update(enquiriesTable).set(updates).where(eq(enquiriesTable.id, enquiryId));

  return result;
}

export async function sendProposalEmail(
  quoteId: number,
  params: {
    customerName: string | null;
    customerEmail: string | null;
    projectType: string | null;
    totalWithVat: number;
    depositAmount: number | null;
    proposalToken: string;
    proposalBaseUrl: string; // e.g. https://example.replit.app/workrate
  },
  company: CompanyBranding
): Promise<{ emailStatus: CommStatus; emailError?: string }> {
  const proposalUrl = `${params.proposalBaseUrl}/proposal/${params.proposalToken}`;

  let emailStatus: CommStatus;
  let emailError: string | undefined;

  if (!(company.proposalEmailEnabled ?? true)) {
    emailStatus = "disabled";
  } else if (!params.customerEmail) {
    emailStatus = "no_recipient";
  } else if (!process.env.RESEND_API_KEY) {
    emailStatus = "not_configured";
  } else {
    const firstName = params.customerName?.split(" ")[0] ?? params.customerName ?? "there";

    const html = buildProposalEmailHtml({
      customerFirstName: firstName,
      projectType: params.projectType,
      totalWithVat: params.totalWithVat,
      depositAmount: params.depositAmount,
      proposalUrl,
      company,
    });

    const sent = await sendViaResend({
      to: params.customerEmail,
      fromName: `${company.name} via WorkRate`,
      replyTo: company.email ?? undefined,
      subject: `Your proposal from ${company.name} is ready`,
      html,
    });

    emailStatus = sent.ok ? "sent" : "failed";
    if (!sent.ok) emailError = sent.error;
  }

  // Persist to DB
  const updates: Record<string, any> = {
    emailDeliveryStatus: emailStatus,
    emailRecipient: params.customerEmail,
    emailError: emailError ?? null,
  };
  if (emailStatus === "sent") updates.emailSentAt = new Date();

  await db.update(quotesTable).set(updates).where(eq(quotesTable.id, quoteId));

  return { emailStatus, emailError };
}

// ── Invoice email ─────────────────────────────────────────────────────────────

export async function sendInvoiceEmail(
  invoiceId: number,
  params: {
    customerEmail: string | null;
    customerName: string | null;
    invoiceNumber: string;
    invoiceDate: string | null;
    dueDate: string | null;
    totalWithVat: number;
    projectDescription: string | null;
  },
  company: CompanyBranding
): Promise<{ emailStatus: CommStatus; emailError?: string }> {
  let emailStatus: CommStatus;
  let emailError: string | undefined;

  if (!params.customerEmail) {
    emailStatus = "no_recipient";
  } else if (!process.env.RESEND_API_KEY) {
    emailStatus = "not_configured";
  } else {
    const colour = primaryColour(company);
    const fmt = (n: number) =>
      new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(n);
    const firstName = params.customerName?.split(" ")[0] ?? "there";

    const body = `
      <p style="margin:0 0 16px;font-size:18px;font-weight:700;color:#111827;">Hi ${firstName},</p>
      <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.6;">
        Please find your invoice from <strong>${company.name}</strong> below.
      </p>
      ${params.projectDescription ? `<div style="background:#f9fafb;border-left:4px solid ${colour};border-radius:4px;padding:10px 16px;margin:0 0 20px;">
        <p style="margin:0;font-size:13px;color:#374151;">${params.projectDescription}</p>
      </div>` : ""}
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <tr>
          <td style="padding:14px 18px;background:#f9fafb;border-bottom:1px solid #e5e7eb;">
            <p style="margin:0;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Invoice Number</p>
            <p style="margin:4px 0 0;font-size:16px;font-weight:800;color:#111827;font-family:monospace;">${params.invoiceNumber}</p>
          </td>
        </tr>
        ${params.invoiceDate ? `<tr>
          <td style="padding:12px 18px;border-bottom:1px solid #e5e7eb;">
            <p style="margin:0;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Invoice Date</p>
            <p style="margin:4px 0 0;font-size:14px;color:#374151;">${params.invoiceDate}</p>
          </td>
        </tr>` : ""}
        ${params.dueDate ? `<tr>
          <td style="padding:12px 18px;border-bottom:1px solid #e5e7eb;">
            <p style="margin:0;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Payment Due</p>
            <p style="margin:4px 0 0;font-size:14px;font-weight:700;color:#dc2626;">${params.dueDate}</p>
          </td>
        </tr>` : ""}
        <tr>
          <td style="padding:14px 18px;">
            <p style="margin:0;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Amount Due</p>
            <p style="margin:4px 0 0;font-size:26px;font-weight:900;color:#111827;">${fmt(params.totalWithVat)}</p>
          </td>
        </tr>
      </table>
      ${company.bankPaymentDetails ? `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px 20px;margin:0 0 24px;">
        <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#15803d;text-transform:uppercase;letter-spacing:0.05em;">Payment Details</p>
        <p style="margin:0;font-size:13px;color:#166534;white-space:pre-line;line-height:1.6;">${company.bankPaymentDetails}</p>
      </div>` : ""}
      ${company.paymentTerms ? `<p style="margin:0 0 20px;font-size:13px;color:#6b7280;line-height:1.5;">${company.paymentTerms}</p>` : ""}
      <p style="margin:0;font-size:13px;color:#9ca3af;text-align:center;line-height:1.5;">
        If you have any questions, please reply to this email.
        ${company.email ? `<br/>Contact us: <a href="mailto:${company.email}" style="color:${colour};">${company.email}</a>` : ""}
      </p>
    `;

    const html = buildEmailShell({
      company,
      preheader: `Invoice ${params.invoiceNumber} from ${company.name} — ${fmt(params.totalWithVat)} due${params.dueDate ? ` ${params.dueDate}` : ""}`,
      body,
    });

    const sent = await sendViaResend({
      to: params.customerEmail,
      fromName: `${company.name} via WorkRate`,
      replyTo: company.email ?? undefined,
      subject: `Invoice ${params.invoiceNumber} from ${company.name} — ${fmt(params.totalWithVat)}`,
      html,
    });

    emailStatus = sent.ok ? "sent" : "failed";
    if (!sent.ok) emailError = sent.error;
  }

  // Persist email status to DB
  const updates: Record<string, any> = {
    emailDeliveryStatus: emailStatus,
    emailRecipient: params.customerEmail,
    emailError: emailError ?? null,
  };
  if (emailStatus === "sent") updates.emailSentAt = new Date();
  await db.update(quotesTable).set(updates).where(eq(quotesTable.id, invoiceId));

  return { emailStatus, emailError };
}

export const DEFAULT_ENQUIRY_CONFIRMATION_MESSAGE = DEFAULT_ENQUIRY_MESSAGE;
