import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  isAllowedInvoiceLogoObjectPath,
  renderInvoicePdf,
  renderQuotePdf,
  type InvoicePdfInput,
  type QuotePdfInput,
} from "../src/services/invoice-pdf";

const company = {
  documentMode: "custom",
  name: "Oak & Hammer Ltd",
  address: "14 Workshop Lane\nBristol BS1 1AA",
  phone: "0117 000 0000",
  email: "accounts@example.test",
  website: "example.test",
  companyRegNumber: "12345678",
  vatNumber: "GB123456789",
  bankPaymentDetails: "Sort code: 00-00-00\nAccount: 12345678",
  depositPaymentInstructions: "Please use the invoice number as the payment reference.",
  brandColourPrimary: "#1E293B",
  brandColourSecondary: "#0d9488",
  paymentTerms: "Payment due within 14 days.",
  termsAndConditions: "Materials remain our property until paid in full.",
  invoiceFooter: "Thank you for choosing Oak & Hammer.",
};

function baseInvoice(overrides: Partial<InvoicePdfInput> = {}): InvoicePdfInput {
  return {
    invoiceNumber: "INV-000123",
    invoiceDate: "2026-08-31",
    dueDate: "2026-09-14",
    customerDetails: "Alex Customer\n42 Market Street\nBath BA1 1AA",
    projectDescription: "Kitchen fitting and associated works",
    materialsAllowance: 1000,
    vatRate: 20,
    vatAmount: 200,
    totalWithVat: 1200,
    status: "sent",
    company,
    ...overrides,
  };
}

test("accepts only canonical uploaded image paths as invoice logos", () => {
  assert.equal(
    isAllowedInvoiceLogoObjectPath("/objects/uploads/a3b13f30-aa5a-4220-9b70-c1583b7deb46.png"),
    true,
  );
  assert.equal(
    isAllowedInvoiceLogoObjectPath("/objects/development/uploads/a3b13f30-aa5a-4220-9b70-c1583b7deb46.png"),
    true,
  );
  assert.equal(
    isAllowedInvoiceLogoObjectPath("/objects/finance/a3b13f30-aa5a-4220-9b70-c1583b7deb46.png"),
    false,
  );
  assert.equal(
    isAllowedInvoiceLogoObjectPath("/objects/uploads/../../finance/a3b13f30-aa5a-4220-9b70-c1583b7deb46.png"),
    false,
  );
  assert.equal(isAllowedInvoiceLogoObjectPath("/objects/uploads/not-a-uuid.png"), false);
  assert.equal(
    isAllowedInvoiceLogoObjectPath("/objects/uploads/a3b13f30-aa5a-4220-9b70-c1583b7deb46.svg"),
    false,
  );
});

async function pdfText(input: InvoicePdfInput): Promise<{ buffer: Buffer; text: string; pages: number }> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "workrate-invoice-pdf-"));
  const pdfPath = path.join(directory, "invoice.pdf");
  const textPath = path.join(directory, "invoice.txt");
  try {
    const buffer = await renderInvoicePdf(input);
    await writeFile(pdfPath, buffer);
    execFileSync("pdftotext", [pdfPath, textPath]);
    const info = execFileSync("pdfinfo", [pdfPath], { encoding: "utf8" });
    const pages = Number(info.match(/^Pages:\s+(\d+)$/m)?.[1] ?? 0);
    return { buffer, text: await readFile(textPath, "utf8"), pages };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function quotePdfText(input: QuotePdfInput): Promise<{ buffer: Buffer; text: string; pages: number }> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "workrate-quote-pdf-"));
  const pdfPath = path.join(directory, "quote.pdf");
  const textPath = path.join(directory, "quote.txt");
  try {
    const buffer = await renderQuotePdf(input);
    await writeFile(pdfPath, buffer);
    execFileSync("pdftotext", [pdfPath, textPath]);
    const info = execFileSync("pdfinfo", [pdfPath], { encoding: "utf8" });
    const pages = Number(info.match(/^Pages:\s+(\d+)$/m)?.[1] ?? 0);
    return { buffer, text: await readFile(textPath, "utf8"), pages };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("renders a simple VAT invoice with company and customer details", async () => {
  const result = await pdfText(baseInvoice({
    lineItems: JSON.stringify([{
      id: "numeric-quantity",
      description: "Numeric quantity test",
      quantity: 37,
      unit: "hours",
      unitPrice: 27.03,
      lineTotal: 1000,
    }]),
  }));
  assert.equal(result.buffer.subarray(0, 5).toString(), "%PDF-");
  assert.match(result.text, /Oak & Hammer Ltd/);
  assert.match(result.text, /Alex Customer/);
  assert.match(result.text, /INV-000123/);
  assert.match(result.text, /Numeric quantity test/);
  assert.match(result.text, /\b37\b/);
  assert.match(result.text, /VAT \(20%\)/);
  assert.match(result.text, /£1200\.00/);
  assert.match(result.text, /PAY M E N T D E TA I L S/);
  assert.match(result.text, /PAY M E N T T E R M S/);
  assert.match(result.text, /Thank you for choosing Oak & Hammer/);
});

test("renders deposit received and remaining balance", async () => {
  const result = await pdfText(baseInvoice({
    depositType: "percentage",
    depositPercent: 50,
    depositAmount: 600,
    depositPaidAmount: 600,
    remainingBalance: 600,
  }));
  assert.match(result.text, /Deposit received \(50%\)/);
  assert.match(result.text, /Remaining balance/);
  assert.match(result.text, /£600\.00/);
  assert.match(result.text, /Sort code/);
});

test("renders a fully paid invoice with zero remaining balance", async () => {
  const result = await pdfText(baseInvoice({
    status: "paid",
    depositType: "percentage",
    depositPercent: 50,
    depositAmount: 600,
    depositPaidAmount: 600,
    remainingBalance: 600,
  }));
  assert.match(result.text, /\bPAID\b/);
  assert.match(result.text, /Remaining balance/);
  assert.match(result.text, /£0\.00/);
});

test("paginates a long itemised invoice and preserves quantities and rates", async () => {
  const lineItems = Array.from({ length: 45 }, (_, index) => ({
    id: String(index + 1),
    description: `Detailed fitted item ${index + 1} with labour and materials included${
      index % 5 === 0
        ? " plus an extended specification that wraps across several lines without overlapping the next invoice row"
        : ""
    }`,
    quantity: index + 1,
    unit: "each",
    unitPrice: 25,
    lineTotal: (index + 1) * 25,
  }));
  const result = await pdfText(baseInvoice({
    lineItems: JSON.stringify(lineItems),
    materialsAllowance: 25875,
    vatAmount: 5175,
    totalWithVat: 31050,
  }));
  assert.ok(result.pages >= 2, `expected at least two pages, got ${result.pages}`);
  assert.match(result.text, /Detailed fitted item 1/);
  assert.match(result.text, /Detailed fitted item 45/);
  assert.match(result.text, /UNIT PRICE/);
  assert.match(result.text, /£25\.00/);
});

test("renders a customer-safe VAT proposal with deposit schedule and terms", async () => {
  const result = await quotePdfText({
    quoteRef: "ENQ-42",
    quoteDate: "2026-08-31",
    customerDetails: "Alex Customer\n42 Market Street\nBath BA1 1AA",
    projectDescription: "Kitchen fitting and associated works",
    estimatedTotal: 1000,
    vatRate: 20,
    vatAmount: 200,
    totalWithVat: 1200,
    depositType: "percentage",
    depositPercent: 50,
    depositAmount: 600,
    remainingBalance: 600,
    notes: "Access is required during working hours.",
    assumptions: "Existing wiring is serviceable.",
    proposalStatus: "sent",
    company: { ...company, quoteFooter: "We look forward to working with you." },
  });
  assert.equal(result.buffer.subarray(0, 5).toString(), "%PDF-");
  assert.match(result.text, /QUOTATION/);
  assert.match(result.text, /ENQ-42/);
  assert.match(result.text, /Alex Customer/);
  assert.match(result.text, /VAT \(20%\)/);
  assert.match(result.text, /Deposit due now \(50%\)/);
  assert.match(result.text, /ASSUMPTIONS & EXCLUSIONS/);
  assert.match(result.text, /Existing wiring is serviceable/);
  assert.match(result.text, /We look forward to working with you/);
});

test("paginates a long quote without dropping the final scope text", async () => {
  const projectDescription = Array.from(
    { length: 110 },
    (_, index) => `Scope item ${index + 1}: detailed customer-facing works description.`,
  ).join("\n");
  const result = await quotePdfText({
    quoteRef: "ENQ-99",
    quoteDate: "2026-08-31",
    customerDetails: "Long Quote Customer",
    projectDescription,
    estimatedTotal: 2500,
    vatRate: 20,
    vatAmount: 500,
    totalWithVat: 3000,
    proposalStatus: "sent",
    company,
  });
  assert.ok(result.pages >= 2, `expected at least two pages, got ${result.pages}`);
  assert.match(result.text, /Scope item 1:/);
  assert.match(result.text, /Scope item 110:/);
  assert.match(result.text, /£3000\.00/);
});