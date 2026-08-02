import { Router, type IRouter } from "express";
import { randomBytes } from "crypto";
import { db, enquiriesTable, enquiryMessagesTable, companiesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  StartChatBody,
  StartChatResponse,
  SendChatMessageBody,
  SendChatMessageParams,
  GetChatSessionParams,
  GetChatSessionResponse,
} from "@workspace/api-zod";
import OpenAI from "openai";

const router: IRouter = Router();

function getOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");
  return new OpenAI({ apiKey });
}

const TRADE_SYSTEM_PROMPTS: Record<string, string> = {
  default: `You are a friendly, professional office assistant for a trade business. Your job is to help customers describe their project so the business owner can prepare an accurate quote.

You need to collect the following information one step at a time in a natural conversation:
1. Customer name
2. Contact details (email or phone)
3. Project type and description
4. Location / postcode
5. Measurements and dimensions (where relevant)
6. Materials or finishes preferred
7. Budget range
8. Preferred timescale

Guidelines:
- Be warm, professional, and concise.
- Ask one or two questions at a time, not all at once.
- If you don't have enough information to understand the scope, ask clarifying questions.
- Do NOT give final prices — always say the business owner will provide a proper quote.
- If the project sounds complex or requires assessing the space, suggest a site visit.
- Once you have collected sufficient information (name, contact, project description, location, at minimum), thank the customer and let them know their enquiry has been submitted and the team will be in touch.

When you believe you have collected enough information, end your response with exactly this JSON on its own line:
ENQUIRY_COMPLETE:{"customerName":"<name>","customerEmail":"<email or null>","customerPhone":"<phone or null>","projectType":"<type>","location":"<location>","description":"<full description>","budget":"<budget or null>","timescale":"<timescale or null>"}`,
};

function getSystemPrompt(tradeType: string): string {
  const key = tradeType.toLowerCase();
  return TRADE_SYSTEM_PROMPTS[key] ?? TRADE_SYSTEM_PROMPTS["default"];
}

// POST /chat/start — public, no auth
router.post("/chat/start", async (req, res): Promise<void> => {
  const parsed = StartChatBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const token = randomBytes(24).toString("hex");

  const [enquiry] = await db
    .insert(enquiriesTable)
    .values({
      customerName: "Unknown",
      status: "new_enquiry",
      chatToken: token,
    })
    .returning();

  // Insert the initial greeting from the assistant
  const openai = getOpenAI();
  const systemPrompt = getSystemPrompt(parsed.data.tradeType);
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 300,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: "Hello, I'd like to enquire about some work." },
    ],
  });

  const greeting = completion.choices[0]?.message?.content ?? "Hello! How can I help you today?";

  await db.insert(enquiryMessagesTable).values({
    enquiryId: enquiry.id,
    role: "assistant",
    content: greeting,
  });

  res.status(201).json(
    StartChatResponse.parse({
      token,
      enquiryId: enquiry.id,
      tradeType: parsed.data.tradeType,
      createdAt: enquiry.createdAt,
    }),
  );
});

// GET /chat/:token — public, no auth
router.get("/chat/:token", async (req, res): Promise<void> => {
  const params = GetChatSessionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid token" });
    return;
  }

  const [enquiry] = await db
    .select()
    .from(enquiriesTable)
    .where(eq(enquiriesTable.chatToken, params.data.token));

  if (!enquiry) {
    res.status(404).json({ error: "Chat session not found" });
    return;
  }

  const messages = await db
    .select()
    .from(enquiryMessagesTable)
    .where(eq(enquiryMessagesTable.enquiryId, enquiry.id))
    .orderBy(enquiryMessagesTable.createdAt);

  res.json(
    GetChatSessionResponse.parse({
      token: enquiry.chatToken!,
      enquiryId: enquiry.id,
      tradeType: enquiry.projectType ?? "General",
      createdAt: enquiry.createdAt,
      messages,
    }),
  );
});

// POST /chat/:token/message — public, SSE
router.post("/chat/:token/message", async (req, res): Promise<void> => {
  const params = SendChatMessageParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid token" });
    return;
  }

  const body = SendChatMessageBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [enquiry] = await db
    .select()
    .from(enquiriesTable)
    .where(eq(enquiriesTable.chatToken, params.data.token));

  if (!enquiry) {
    res.status(404).json({ error: "Chat session not found" });
    return;
  }

  // Save user message
  await db.insert(enquiryMessagesTable).values({
    enquiryId: enquiry.id,
    role: "customer",
    content: body.data.content,
  });

  // Load chat history
  const history = await db
    .select()
    .from(enquiryMessagesTable)
    .where(eq(enquiryMessagesTable.enquiryId, enquiry.id))
    .orderBy(enquiryMessagesTable.createdAt);

  // Get company info for context
  const [company] = await db.select().from(companiesTable).limit(1);
  const tradeType = company?.tradeType ?? "trade";

  const systemPrompt = getSystemPrompt(tradeType);

  const chatMessages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...history.map((m) => ({
      role: (m.role === "customer" ? "user" : "assistant") as "user" | "assistant",
      content: m.content,
    })),
  ];

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const openai = getOpenAI();
  const stream = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 500,
    messages: chatMessages,
    stream: true,
  });

  let fullResponse = "";

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content;
    if (content) {
      fullResponse += content;
      res.write(`data: ${JSON.stringify({ content })}\n\n`);
    }
  }

  // Save assistant response (strip ENQUIRY_COMPLETE line if present)
  const displayResponse = fullResponse.replace(/\nENQUIRY_COMPLETE:.*$/, "").trim();

  await db.insert(enquiryMessagesTable).values({
    enquiryId: enquiry.id,
    role: "assistant",
    content: displayResponse,
  });

  // Check if enquiry is complete and extract data
  const completionMatch = fullResponse.match(/ENQUIRY_COMPLETE:(\{.*\})/);
  if (completionMatch) {
    try {
      const extracted = JSON.parse(completionMatch[1]);
      await db
        .update(enquiriesTable)
        .set({
          customerName: extracted.customerName ?? enquiry.customerName,
          customerEmail: extracted.customerEmail ?? enquiry.customerEmail,
          customerPhone: extracted.customerPhone ?? enquiry.customerPhone,
          projectType: extracted.projectType ?? enquiry.projectType,
          location: extracted.location ?? enquiry.location,
          description: extracted.description ?? enquiry.description,
          budget: extracted.budget ?? enquiry.budget,
          timescale: extracted.timescale ?? enquiry.timescale,
        })
        .where(eq(enquiriesTable.id, enquiry.id));
    } catch {
      // ignore parse errors
    }
  }

  res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  res.end();
});

export default router;
