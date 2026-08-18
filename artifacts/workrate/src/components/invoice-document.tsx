/**
 * InvoiceDocument — branded invoice PDF preview.
 * Reuses the same branding-snapshot logic as QuoteDocument but renders
 * "INVOICE" headings, invoice-specific metadata, and an itemised line-items
 * table when line items are present.
 */

export interface InvoiceLine {
  id: string;
  description: string;
  quantity: number | string;
  unit: string;
  unitPrice: number | string;
  lineTotal: number | string;
}

interface BrandingData {
  documentMode?: string | null;
  name?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  companyRegNumber?: string | null;
  vatNumber?: string | null;
  bankPaymentDetails?: string | null;
  brandColourPrimary?: string | null;
  brandColourSecondary?: string | null;
  paymentTerms?: string | null;
  termsAndConditions?: string | null;
  invoiceFooter?: string | null;
  logoUrl?: string | null;
}

interface InvoiceDocProps {
  invoiceNumber: string;
  invoiceDate: string;
  dueDate?: string | null;
  company: any;
  brandingSnapshot?: string | null;
  customerDetails: string;
  projectDescription: string;
  lineItems?: InvoiceLine[];
  subtotal: number;   // pre-VAT total
  vatRate: number;
  vatAmount: number;
  total: number;
  notes: string;
  status: string;
}

function isLight(hex: string): boolean {
  const c = hex.replace("#", "");
  if (c.length !== 6) return false;
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b > 160;
}

function fmt(n: number | string): string {
  return `£${Number(n).toFixed(2)}`;
}

export function InvoiceDocument({
  invoiceNumber,
  invoiceDate,
  dueDate,
  company,
  brandingSnapshot,
  customerDetails,
  projectDescription,
  lineItems,
  subtotal,
  vatRate,
  vatAmount,
  total,
  notes,
  status,
}: InvoiceDocProps) {
  const isPaid = status === "paid";

  const snapshotData: BrandingData | null = (() => {
    if (!brandingSnapshot) return null;
    try { return JSON.parse(brandingSnapshot); } catch { return null; }
  })();

  const b: BrandingData = snapshotData ?? (company as BrandingData) ?? {};
  const isCustom = (b.documentMode ?? "workrate") === "custom";

  const companyName = b.name ?? "Your Trade Business";
  const headerBg = isCustom && b.brandColourPrimary ? b.brandColourPrimary : "#1E293B";
  const accentColour = isCustom && b.brandColourSecondary ? b.brandColourSecondary : "#0d9488";
  const headerTextClass = isLight(headerBg) ? "text-gray-900" : "text-white";
  const headerSubClass = isLight(headerBg) ? "text-gray-500" : "text-slate-400";

  const footerText = isCustom && b.invoiceFooter
    ? b.invoiceFooter
    : "Payment is due by the date stated above. Thank you for your business.";

  const hasLineItems = lineItems && lineItems.length > 0;

  return (
    <div className="print-doc">
      <div
        id="invoice-document"
        className="bg-white text-gray-900 rounded-2xl shadow-xl border border-gray-200 overflow-hidden font-sans print:shadow-none print:rounded-none print:border-none"
        style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="px-10 py-8" style={{ backgroundColor: headerBg }}>
          <div className="flex items-start justify-between gap-6">
            <div>
              <div className="flex items-center gap-3 mb-3">
                {isCustom && b.logoUrl ? (
                  <img src={b.logoUrl} alt={companyName} className="h-12 max-w-[180px] object-contain" />
                ) : (
                  <>
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                      style={{ backgroundColor: accentColour }}
                    >
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                          d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                    </div>
                    <span className={`text-lg font-black tracking-tight ${headerTextClass}`}>{companyName}</span>
                  </>
                )}
              </div>
              <div className={`text-xs space-y-0.5 ${headerSubClass}`}>
                {b.address && <p>{b.address}</p>}
                {b.phone && <p>{b.phone}</p>}
                {b.email && <p>{b.email}</p>}
                {b.website && <p>{b.website}</p>}
                {isCustom && b.companyRegNumber && <p>Co. Reg: {b.companyRegNumber}</p>}
                {isCustom && b.vatNumber && <p>VAT: {b.vatNumber}</p>}
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className={`text-3xl font-black tracking-tight ${headerTextClass}`}>INVOICE</p>
              <p className={`text-sm font-mono font-bold mt-1 ${headerSubClass}`}>{invoiceNumber}</p>
              {isPaid && (
                <div
                  className="mt-2 inline-block px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest"
                  style={{ backgroundColor: accentColour, color: "#fff" }}
                >
                  PAID
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Invoice metadata ─────────────────────────────────────────────── */}
        <div className="px-10 py-5 grid grid-cols-2 gap-6 border-b border-gray-100 bg-gray-50">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Bill To</p>
            <p className="text-sm font-semibold text-gray-800 whitespace-pre-line">
              {customerDetails || "—"}
            </p>
          </div>
          <div className="text-right space-y-1">
            <div className="flex justify-end gap-8">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Invoice Date</p>
                <p className="text-sm font-semibold">{invoiceDate || "—"}</p>
              </div>
              {dueDate && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Due Date</p>
                  <p className="text-sm font-bold" style={{ color: "#dc2626" }}>{dueDate}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Project description ─────────────────────────────────────────── */}
        {projectDescription && (
          <div className="px-10 py-4 border-b border-gray-100">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Description</p>
            <p className="text-sm text-gray-700">{projectDescription}</p>
          </div>
        )}

        {/* ── Line items or simple total ───────────────────────────────────── */}
        <div className="px-10 py-6">
          {hasLineItems ? (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b-2 border-gray-200">
                  <th className="text-left pb-2 text-[10px] font-bold uppercase tracking-wider text-gray-500 pr-4">Description</th>
                  <th className="text-center pb-2 text-[10px] font-bold uppercase tracking-wider text-gray-500 w-12">Qty</th>
                  <th className="text-left pb-2 text-[10px] font-bold uppercase tracking-wider text-gray-500 w-16">Unit</th>
                  <th className="text-right pb-2 text-[10px] font-bold uppercase tracking-wider text-gray-500 w-20">Unit Price</th>
                  <th className="text-right pb-2 text-[10px] font-bold uppercase tracking-wider text-gray-500 w-20">Total</th>
                </tr>
              </thead>
              <tbody>
                {lineItems!.map((line, i) => (
                  <tr key={line.id ?? i} className="border-b border-gray-100">
                    <td className="py-2.5 pr-4 text-gray-800 font-medium">{line.description || <span className="italic text-gray-400">—</span>}</td>
                    <td className="py-2.5 text-center text-gray-600">{line.quantity ?? "—"}</td>
                    <td className="py-2.5 text-gray-400 text-xs">{line.unit ?? "—"}</td>
                    <td className="py-2.5 text-right text-gray-600">{line.unitPrice != null ? fmt(line.unitPrice) : "—"}</td>
                    <td className="py-2.5 text-right font-semibold">{line.lineTotal != null ? fmt(line.lineTotal) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="text-sm text-gray-600">
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="font-medium">Works as described</span>
                <span className="font-semibold">{fmt(subtotal)}</span>
              </div>
            </div>
          )}

          {/* Totals */}
          <div className="mt-4 ml-auto max-w-xs space-y-1.5 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>Subtotal</span>
              <span>{fmt(subtotal)}</span>
            </div>
            <div className="flex justify-between text-gray-500">
              <span>VAT ({vatRate}%)</span>
              <span>{fmt(vatAmount)}</span>
            </div>
            <div
              className="flex justify-between font-black text-base pt-2 border-t-2 border-gray-900"
            >
              <span>Total</span>
              <span>{fmt(total)}</span>
            </div>
          </div>
        </div>

        {/* ── Notes ──────────────────────────────────────────────────────── */}
        {notes && (
          <div className="px-10 py-4 border-t border-gray-100 bg-gray-50">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Notes</p>
            <p className="text-xs text-gray-600 leading-relaxed">{notes}</p>
          </div>
        )}

        {/* ── Payment details ─────────────────────────────────────────────── */}
        {isCustom && b.bankPaymentDetails && (
          <div className="px-10 py-4 border-t border-gray-100">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Payment Details</p>
            <p className="text-xs text-gray-700 whitespace-pre-line leading-relaxed">{b.bankPaymentDetails}</p>
          </div>
        )}

        {/* ── Terms ──────────────────────────────────────────────────────── */}
        {isCustom && b.paymentTerms && (
          <div className="px-10 py-3 border-t border-gray-100">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Payment Terms</p>
            <p className="text-xs text-gray-600">{b.paymentTerms}</p>
          </div>
        )}

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <div
          className="px-10 py-4 border-t"
          style={{ borderColor: accentColour + "33", backgroundColor: accentColour + "0d" }}
        >
          <p className="text-xs text-gray-500 text-center">{footerText}</p>
        </div>
      </div>
    </div>
  );
}
