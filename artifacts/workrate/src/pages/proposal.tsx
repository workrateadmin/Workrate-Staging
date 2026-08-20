/**
 * Public customer-facing proposal page.
 * Accessible via /proposal/:token — no authentication required.
 */
import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/utils";

const basePath = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${basePath}/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

type ProposalData = {
  id: number;
  enquiryId: number;
  customerDetails?: string | null;
  projectDescription?: string | null;
  totalWithVat: number;
  notes?: string | null;
  assumptions?: string | null;
  proposalStatus: string;
  depositType?: string | null;
  depositPercent?: number | null;
  depositFixed?: number | null;
  depositAmount?: number | null;
  remainingBalance?: number | null;
  depositPaidAt?: string | null;
  depositPaidAmount?: number | null;
  acceptedAt?: string | null;
  acceptedByName?: string | null;
  viewedAt?: string | null;
  customerQuestion?: string | null;
  createdAt: string;
  company: {
    name: string;
    logoUrl?: string | null;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    website?: string | null;
    vatNumber?: string | null;
    brandColourPrimary?: string | null;
    paymentTerms?: string | null;
    termsAndConditions?: string | null;
    bankPaymentDetails?: string | null;
    depositPaymentInstructions?: string | null;
  };
};

type Screen = "view" | "accept-form" | "question-form" | "accepted" | "declined" | "already-responded";

function StatusBanner({ status }: { status: string }) {
  const map: Record<string, { label: string; bg: string; text: string }> = {
    accepted:                { label: "Proposal Accepted", bg: "#d1fae5", text: "#065f46" },
    deposit_awaiting_payment:{ label: "Deposit Awaiting Payment", bg: "#fef3c7", text: "#92400e" },
    deposit_paid:            { label: "Deposit Paid — Job Confirmed", bg: "#d1fae5", text: "#065f46" },
    declined:                { label: "Proposal Declined", bg: "#fee2e2", text: "#991b1b" },
    viewed:                  { label: "Proposal Viewed", bg: "#ede9fe", text: "#5b21b6" },
    sent:                    { label: "Proposal Open", bg: "#ccfbf1", text: "#0f766e" },
  };
  const s = map[status];
  if (!s) return null;
  return (
    <div style={{ background: s.bg, color: s.text }} className="text-center py-3 px-6 text-sm font-bold rounded-xl mb-6">
      {s.label}
    </div>
  );
}

export default function ProposalPage() {
  const { token } = useParams<{ token: string }>();
  const [proposal, setProposal] = useState<ProposalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>("view");
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!token) return;
    apiFetch(`/proposals/${token}`)
      .then((data) => {
        setProposal(data);
        // Determine initial screen
        if (["accepted", "deposit_awaiting_payment", "deposit_paid"].includes(data.proposalStatus)) {
          setScreen("accepted");
        } else if (data.proposalStatus === "declined") {
          setScreen("declined");
        } else {
          setScreen("view");
          // Record view
          apiFetch(`/proposals/${token}/view`, { method: "POST" }).catch(() => {});
        }
        setLoading(false);
      })
      .catch((e) => {
        setError("This proposal could not be found or is no longer available.");
        setLoading(false);
      });
  }, [token]);

  async function handleRespond(action: "accept" | "decline" | "question") {
    setSubmitting(true);
    try {
      const updated = await apiFetch(`/proposals/${token}/respond`, {
        method: "POST",
        body: JSON.stringify({ action, name, email, message }),
      });
      if (action === "accept") {
        setProposal(await apiFetch(`/proposals/${token}`));
      } else {
        setProposal((current) =>
          current
            ? { ...current, ...updated, company: current.company }
            : updated,
        );
      }
      setSubmitted(true);
      if (action === "accept") setScreen("accepted");
      else if (action === "decline") setScreen("declined");
      else { setScreen("view"); } // question sent, stay on view
    } catch (e) {
      alert("Something went wrong. Please try again or contact the business directly.");
    } finally {
      setSubmitting(false);
    }
  }

  const primaryColor = proposal?.company?.brandColourPrimary ?? "#0f766e";

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full border-4 border-gray-200 border-t-teal-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-500 font-semibold">Loading proposal…</p>
        </div>
      </div>
    );
  }

  if (error || !proposal) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="bg-white rounded-2xl p-10 shadow-xl max-w-md w-full text-center">
          <div className="text-5xl mb-4">🔍</div>
          <h1 className="text-xl font-black mb-3">Proposal Not Found</h1>
          <p className="text-gray-500 font-medium">{error ?? "This link may have expired or is invalid."}</p>
        </div>
      </div>
    );
  }

  const depositAmt = proposal.depositAmount ?? 0;
  const remaining = proposal.remainingBalance ?? (proposal.totalWithVat - depositAmt);
  const hasDeposit = proposal.depositType !== "none" && depositAmt > 0;

  const company = proposal.company;

  // ── Accepted screen ────────────────────────────────────────────────────────
  if (screen === "accepted") {
    const isDepositPaid = Boolean(proposal.depositPaidAt) || proposal.proposalStatus === "deposit_paid";
    const isDepositAwaitingPayment =
      hasDeposit &&
      !isDepositPaid &&
      ["accepted", "deposit_awaiting_payment"].includes(proposal.proposalStatus);
    return (
      <div className="min-h-screen bg-gray-50 py-12 px-4">
        <div className="max-w-lg mx-auto">
          <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
            {/* Header */}
            <div style={{ background: primaryColor }} className="px-8 py-8 text-white text-center">
              {company.logoUrl && (
                <img src={company.logoUrl} alt={company.name} className="h-10 object-contain mx-auto mb-4 opacity-90 brightness-0 invert" />
              )}
              <div className="text-4xl mb-3">✅</div>
              <h1 className="text-2xl font-black mb-1">Proposal Accepted!</h1>
              <p className="opacity-80 font-medium">{company.name}</p>
            </div>
            <div className="p-8 space-y-6">
              <div className="bg-green-50 border border-green-200 rounded-xl p-5 text-center">
                <p className="text-2xl font-black text-green-800">{formatCurrency(proposal.totalWithVat)}</p>
                <p className="text-sm text-green-700 font-semibold mt-1">Total Project Value</p>
              </div>

              {hasDeposit && (
                <div className="space-y-3">
                  <div className="flex justify-between items-center py-3 border-b border-gray-100">
                    <span className="font-semibold text-gray-700">
                      {isDepositPaid ? "Deposit Paid ✓" : "Deposit Required"}
                    </span>
                    <span className={`font-black text-lg ${isDepositPaid ? "text-green-700" : "text-amber-700"}`}>
                      {formatCurrency(depositAmt)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-3">
                    <span className="font-semibold text-gray-700">Remaining Balance</span>
                    <span className="font-black text-lg text-gray-900">{formatCurrency(remaining)}</span>
                  </div>
                </div>
              )}

              {!hasDeposit && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-5 text-center">
                  <p className="font-bold text-green-800">No deposit is required</p>
                  <p className="text-sm text-green-700 mt-1">Your accepted proposal is confirmed and ready to schedule.</p>
                </div>
              )}

              {isDepositAwaitingPayment && hasDeposit && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 space-y-3">
                  <h3 className="font-bold text-amber-900">Next Step: Pay Your Deposit</h3>
                  {company.depositPaymentInstructions ? (
                    <p className="text-sm text-amber-800 whitespace-pre-wrap font-medium">{company.depositPaymentInstructions}</p>
                  ) : company.bankPaymentDetails ? (
                    <p className="text-sm text-amber-800 whitespace-pre-wrap font-mono">{company.bankPaymentDetails}</p>
                  ) : (
                    <p className="text-sm text-amber-700">Please contact {company.name} to arrange your deposit payment of {formatCurrency(depositAmt)}.</p>
                  )}
                </div>
              )}

              <div className="bg-gray-50 rounded-xl p-5 space-y-2 text-sm">
                <p className="font-bold text-gray-700 mb-3">Contact {company.name}</p>
                {company.email && <p className="text-gray-600">📧 {company.email}</p>}
                {company.phone && <p className="text-gray-600">📞 {company.phone}</p>}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Declined screen ────────────────────────────────────────────────────────
  if (screen === "declined") {
    return (
      <div className="min-h-screen bg-gray-50 py-12 px-4">
        <div className="max-w-lg mx-auto">
          <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
            <div style={{ background: "#6b7280" }} className="px-8 py-8 text-white text-center">
              <div className="text-4xl mb-3">📋</div>
              <h1 className="text-2xl font-black mb-1">Proposal Declined</h1>
              <p className="opacity-80 font-medium">{company.name}</p>
            </div>
            <div className="p-8 text-center space-y-4">
              <p className="text-gray-600 font-medium">Thank you for letting us know. If you change your mind or would like to discuss further, please get in touch.</p>
              {company.email && <p className="font-semibold text-gray-700">📧 {company.email}</p>}
              {company.phone && <p className="font-semibold text-gray-700">📞 {company.phone}</p>}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Accept form ────────────────────────────────────────────────────────────
  if (screen === "accept-form") {
    return (
      <div className="min-h-screen bg-gray-50 py-12 px-4">
        <div className="max-w-lg mx-auto bg-white rounded-2xl shadow-xl overflow-hidden">
          <div style={{ background: primaryColor }} className="px-8 py-6 text-white">
            <button onClick={() => setScreen("view")} className="text-white/70 hover:text-white text-sm font-semibold mb-3 flex items-center gap-1">
              ← Back to Proposal
            </button>
            <h2 className="text-2xl font-black">Accept Proposal</h2>
            <p className="opacity-80 font-medium mt-1">Confirm your details below to accept this proposal.</p>
          </div>
          <div className="p-8 space-y-5">
            {hasDeposit && (
              <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 text-center">
                <p className="text-sm font-bold text-teal-800 mb-1">Deposit Required on Acceptance</p>
                <p className="text-3xl font-black text-teal-700">{formatCurrency(depositAmt)}</p>
                <p className="text-xs text-teal-600 mt-1">Remaining balance: {formatCurrency(remaining)}</p>
              </div>
            )}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1.5">Your Name *</label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. John Smith" className="h-11" />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1.5">Your Email *</label>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="e.g. john@example.com" className="h-11" />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1.5">Additional Comments (optional)</label>
              <Textarea value={message} onChange={e => setMessage(e.target.value)} rows={3} placeholder="Any notes or questions before accepting…" className="resize-none" />
            </div>
            <Button
              className="w-full h-12 font-bold text-white rounded-xl text-base"
              style={{ background: primaryColor }}
              disabled={!name || !email || submitting}
              onClick={() => handleRespond("accept")}
            >
              {submitting ? "Accepting…" : "✅ Confirm Acceptance"}
            </Button>
            <p className="text-xs text-center text-gray-500">By accepting you agree to the terms and conditions set out in this proposal.</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Question form ──────────────────────────────────────────────────────────
  if (screen === "question-form") {
    return (
      <div className="min-h-screen bg-gray-50 py-12 px-4">
        <div className="max-w-lg mx-auto bg-white rounded-2xl shadow-xl overflow-hidden">
          <div style={{ background: primaryColor }} className="px-8 py-6 text-white">
            <button onClick={() => setScreen("view")} className="text-white/70 hover:text-white text-sm font-semibold mb-3 flex items-center gap-1">
              ← Back to Proposal
            </button>
            <h2 className="text-2xl font-black">Ask a Question</h2>
            <p className="opacity-80 font-medium mt-1">We'll get back to you as soon as possible.</p>
          </div>
          <div className="p-8 space-y-5">
            {submitted ? (
              <div className="text-center py-8">
                <div className="text-5xl mb-4">💬</div>
                <h3 className="text-xl font-black mb-2">Question Sent!</h3>
                <p className="text-gray-500 font-medium">{company.name} will be in touch shortly.</p>
                <Button variant="outline" className="mt-6 font-bold" onClick={() => { setScreen("view"); setSubmitted(false); }}>
                  Back to Proposal
                </Button>
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1.5">Your Name</label>
                  <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. John Smith" className="h-11" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1.5">Your Question *</label>
                  <Textarea value={message} onChange={e => setMessage(e.target.value)} rows={4} placeholder="What would you like to know?" className="resize-none" />
                </div>
                <Button
                  className="w-full h-12 font-bold rounded-xl text-base"
                  style={{ background: primaryColor, color: "#fff" }}
                  disabled={!message || submitting}
                  onClick={() => handleRespond("question")}
                >
                  {submitting ? "Sending…" : "💬 Send Question"}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Main proposal view ─────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 print:bg-white print:py-0">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Company header */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden print:shadow-none print:rounded-none">
          <div style={{ background: primaryColor }} className="px-8 py-8 text-white">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                {company.logoUrl ? (
                  <img src={company.logoUrl} alt={company.name} className="h-10 object-contain mb-3 brightness-0 invert opacity-90" />
                ) : (
                  <h1 className="text-2xl font-black mb-1">{company.name}</h1>
                )}
                <div className="text-white/80 text-sm font-medium space-y-0.5">
                  {company.address && <p>{company.address}</p>}
                  {company.phone && <p>{company.phone}</p>}
                  {company.email && <p>{company.email}</p>}
                </div>
              </div>
              <div className="text-right">
                <p className="text-4xl font-black opacity-20 tracking-tight">PROPOSAL</p>
                <p className="text-white/70 text-sm font-semibold mt-1">
                  {new Date(proposal.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
                </p>
              </div>
            </div>
          </div>

          <div className="px-8 py-6">
            <StatusBanner status={proposal.proposalStatus} />

            {/* Customer details */}
            {proposal.customerDetails && (
              <div className="mb-6">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Prepared for</p>
                <p className="font-bold text-gray-800 text-lg whitespace-pre-wrap">{proposal.customerDetails}</p>
              </div>
            )}

            {/* Project description */}
            {proposal.projectDescription && (
              <div className="mb-6 p-5 bg-gray-50 rounded-xl border border-gray-100">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Project Description</p>
                <p className="text-gray-700 leading-relaxed font-medium whitespace-pre-wrap">{proposal.projectDescription}</p>
              </div>
            )}
          </div>
        </div>

        {/* Proposal total */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-8 py-5 border-b border-gray-100">
            <h2 className="text-lg font-black text-gray-900">Project Total</h2>
          </div>
          <div className="px-8 py-6">
            <div className="flex items-end justify-between gap-6 rounded-xl bg-gray-50 border border-gray-100 px-5 py-5">
              <div>
                <p className="text-sm font-bold text-gray-800">Your quoted project total</p>
                <p className="text-sm text-gray-500 font-medium mt-1">Includes all agreed work and applicable VAT.</p>
              </div>
              <p className="shrink-0 text-3xl font-black" style={{ color: primaryColor }}>
                {formatCurrency(proposal.totalWithVat)}
              </p>
            </div>
          </div>
        </div>

        {/* Deposit summary */}
        {hasDeposit && (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="px-8 py-5 border-b border-gray-100">
              <h2 className="text-lg font-black text-gray-900">Payment Schedule</h2>
            </div>
            <div className="px-8 py-6 space-y-4">
              <div className="flex justify-between items-center py-3 border-b border-gray-100">
                <div>
                  <p className="font-bold text-gray-800">
                    Deposit
                    {proposal.depositType === "percentage" && proposal.depositPercent
                      ? ` (${proposal.depositPercent}%)`
                      : ""}
                  </p>
                  <p className="text-sm text-gray-500 font-medium">Due on acceptance</p>
                </div>
                <p className="text-xl font-black" style={{ color: primaryColor }}>{formatCurrency(depositAmt)}</p>
              </div>
              <div className="flex justify-between items-center py-3">
                <div>
                  <p className="font-bold text-gray-800">Remaining Balance</p>
                  <p className="text-sm text-gray-500 font-medium">Due on completion</p>
                </div>
                <p className="text-xl font-black text-gray-900">{formatCurrency(remaining)}</p>
              </div>

            </div>
          </div>
        )}

        {/* Notes and assumptions */}
        {(proposal.notes || proposal.assumptions) && (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="px-8 py-5 border-b border-gray-100">
              <h2 className="text-lg font-black text-gray-900">Notes &amp; Assumptions</h2>
            </div>
            <div className="px-8 py-6 space-y-5">
              {proposal.notes && (
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Notes</p>
                  <p className="text-gray-700 leading-relaxed font-medium whitespace-pre-wrap">{proposal.notes}</p>
                </div>
              )}
              {proposal.assumptions && (
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Assumptions</p>
                  <p className="text-gray-700 leading-relaxed font-medium whitespace-pre-wrap">{proposal.assumptions}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Payment terms */}
        {company.paymentTerms && (
          <div className="bg-white rounded-2xl shadow-sm px-8 py-6">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Payment Terms</p>
            <p className="text-sm text-gray-700 font-medium">{company.paymentTerms}</p>
          </div>
        )}

        {/* T&C */}
        {company.termsAndConditions && (
          <div className="bg-white rounded-2xl shadow-sm px-8 py-6">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Terms &amp; Conditions</p>
            <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap font-medium">{company.termsAndConditions}</p>
          </div>
        )}

        {/* Action buttons */}
        {["sent", "viewed"].includes(proposal.proposalStatus) && (
          <div className="bg-white rounded-2xl shadow-sm px-8 py-8 space-y-4 print:hidden">
            <h2 className="text-xl font-black text-gray-900 text-center mb-6">Your Response</h2>
            <Button
              className="w-full h-14 font-black text-white rounded-xl text-lg shadow-lg"
              style={{ background: primaryColor }}
              onClick={() => setScreen("accept-form")}
            >
              ✅ Accept Proposal
            </Button>
            <Button
              variant="outline"
              className="w-full h-12 font-bold rounded-xl border-2 text-gray-700"
              onClick={() => setScreen("question-form")}
            >
              💬 Ask a Question
            </Button>
            <Button
              variant="ghost"
              className="w-full h-11 font-semibold rounded-xl text-gray-400 hover:text-red-600 hover:bg-red-50"
              onClick={() => {
                if (confirm("Are you sure you want to decline this proposal?")) {
                  handleRespond("decline");
                }
              }}
              disabled={submitting}
            >
              Decline Proposal
            </Button>
          </div>
        )}

        {/* Download PDF */}
        <div className="text-center pb-12 print:hidden">
          <button
            onClick={() => window.print()}
            className="text-sm font-bold text-gray-400 hover:text-gray-600 transition-colors underline underline-offset-4"
          >
            📄 Download / Print PDF
          </button>
        </div>
      </div>
    </div>
  );
}
