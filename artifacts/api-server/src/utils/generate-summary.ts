import OpenAI from "openai";
import { db, enquiriesTable, enquiryMessagesTable, companiesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export interface StructuredSummary {
  customer: string;
  project: string;
  location: string;
  budget: string;
  summary: string;
  measurements: string;
  materials: string;
  customerRequirements: string;
  potentialChallenges: string;
  recommendedNextAction: string;
}

function getOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");
  return new OpenAI({ apiKey });
}

export async function generateAndSaveSummary(enquiryId: number): Promise<void> {
  const [[enquiry], messages, [company]] = await Promise.all([
    db.select().from(enquiriesTable).where(eq(enquiriesTable.id, enquiryId)),
    db
      .select()
      .from(enquiryMessagesTable)
      .where(eq(enquiryMessagesTable.enquiryId, enquiryId))
      .orderBy(enquiryMessagesTable.createdAt),
    db.select().from(companiesTable).limit(1),
  ]);

  if (!enquiry) throw new Error("Enquiry not found");

  const chatHistory = messages
    .map((m) => `${m.role === "customer" ? "Customer" : "Assistant"}: ${m.content}`)
    .join("\n");

  const customerLine = [enquiry.customerName, enquiry.customerPhone, enquiry.customerEmail]
    .filter(Boolean)
    .join(" — ");

  // Build Brain context block from company settings
  const brainLines: string[] = [];
  if (company) {
    brainLines.push(`Business: ${company.name} (${company.tradeType})`);
    brainLines.push(`Labour rate: £${company.labourRatePerHour}/hr${company.dayRate ? `, £${company.dayRate}/day` : ""}`);
    brainLines.push(`Materials markup: ${company.materialMarkupPercent}%`);
    if (company.minimumProjectValue) brainLines.push(`Minimum project value: £${company.minimumProjectValue}`);
    if (company.serviceArea) brainLines.push(`Service area: ${company.serviceArea}`);
    if (company.preferredSuppliers) brainLines.push(`Preferred suppliers: ${company.preferredSuppliers}`);
    if (company.typicalLeadTimes) brainLines.push(`Typical lead times: ${company.typicalLeadTimes}`);
  }

  const prompt = `You are an experienced trade business office manager in the UK. Analyse the following customer enquiry and produce a structured job summary for the tradesperson.

${brainLines.length > 0 ? `Business context (WorkRate Brain):\n${brainLines.join("\n")}\n` : ""}
Customer details:
- Name: ${enquiry.customerName}
- Email: ${enquiry.customerEmail ?? "Not provided"}
- Phone: ${enquiry.customerPhone ?? "Not provided"}
- Postcode/Location: ${enquiry.location ?? "Not provided"}
- Project Type: ${enquiry.projectType ?? "Not specified"}
- Description: ${enquiry.description ?? "Not provided"}
- Budget: ${enquiry.budget ?? "Not provided"}
- Timescale: ${enquiry.timescale ?? "Not provided"}
${chatHistory ? `\nChat transcript:\n${chatHistory}` : ""}

Use the Business context above to inform your assessment — e.g. flag if the budget is below the minimum project value, reference lead times, or note if preferred suppliers are relevant. Return ONLY a valid JSON object with these exact keys (no markdown, raw JSON only):
{
  "customer": "${customerLine}",
  "project": "<project type and brief scope — 1 line>",
  "location": "<postcode or area>",
  "budget": "<budget range or 'Not specified'>",
  "summary": "<2–3 sentences: professional overview of scope, key requirements, and any standout details. Note any concerns against business settings>",
  "measurements": "<all dimensions, areas, room sizes, quantities mentioned — or 'Not specified'>",
  "materials": "<materials, finishes, brands, or product preferences — or 'Not specified'>",
  "customerRequirements": "<specific requirements, preferences, constraints, or wishes>",
  "potentialChallenges": "<risks, complications, access issues, budget concerns, or things to verify on site>",
  "recommendedNextAction": "<concrete next step e.g. 'Arrange site survey to confirm measurements and access'>"
}`;

  const openai = getOpenAI();
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 700,
    response_format: { type: "json_object" },
    messages: [{ role: "user", content: prompt }],
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";

  let parsed: StructuredSummary;
  try {
    parsed = JSON.parse(raw) as StructuredSummary;
  } catch {
    parsed = {
      customer: customerLine,
      project: enquiry.projectType ?? "General enquiry",
      location: enquiry.location ?? "Not specified",
      budget: enquiry.budget ?? "Not specified",
      summary: raw,
      measurements: "Not specified",
      materials: "Not specified",
      customerRequirements: enquiry.description ?? "Not specified",
      potentialChallenges: "Review chat transcript for full details",
      recommendedNextAction: "Contact customer to discuss requirements",
    };
  }

  await db
    .update(enquiriesTable)
    .set({ aiSummary: JSON.stringify(parsed) })
    .where(eq(enquiriesTable.id, enquiryId));
}
