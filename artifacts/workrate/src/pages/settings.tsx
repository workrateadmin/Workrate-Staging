import { useUser } from "@clerk/react";
import { useGetCompany, useUpdateCompany, type CompanyInput } from "@workspace/api-client-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { companySchema } from "@/lib/schemas";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useRef } from "react";
import {
  Save, Building2, MapPin, PoundSterling, Brain, Users, Clock, Package, Wrench,
  TrendingUp, Sparkles, Code2, Copy, ExternalLink, CheckCheck, AlertTriangle,
  Palette, FileText, Upload, X, ImageIcon, CheckCircle2, Globe,
} from "lucide-react";
import { useState as useLocalState } from "react";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";

type FormValues = z.infer<typeof companySchema>;

const TRADE_TYPES = [
  "Joinery", "Building / General Contractor", "Electrical", "Plumbing",
  "Kitchen Installation", "Bathroom Installation", "Plastering", "Roofing",
  "Flooring", "Painting & Decorating", "Landscaping", "HVAC",
];

export default function Settings() {
  const { data: company, isLoading } = useGetCompany();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const updateCompany = useUpdateCompany({
    mutation: {
      onSuccess: (data) => {
        toast({ title: "Settings saved" });
        queryClient.setQueryData(["/api/company"], data);
      },
      onError: () => {
        toast({ title: "Failed to save settings", variant: "destructive" });
      },
    },
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(companySchema),
    defaultValues: {
      name: "",
      tradeType: "",
      serviceArea: "",
      labourRatePerHour: 0,
      dayRate: undefined,
      materialMarkupPercent: 20,
      minimumProjectValue: undefined,
      typicalLeadTimes: "",
      preferredSuppliers: "",
      email: "",
      phone: "",
      address: "",
    },
  });

  const initialized = useRef(false);

  useEffect(() => {
    if (company && !initialized.current) {
      form.reset({
        name: company.name ?? "",
        tradeType: company.tradeType ?? "",
        serviceArea: company.serviceArea ?? "",
        labourRatePerHour: company.labourRatePerHour ?? 0,
        dayRate: company.dayRate ?? undefined,
        materialMarkupPercent: company.materialMarkupPercent ?? 20,
        minimumProjectValue: company.minimumProjectValue ?? undefined,
        typicalLeadTimes: company.typicalLeadTimes ?? "",
        preferredSuppliers: company.preferredSuppliers ?? "",
        email: company.email ?? "",
        phone: company.phone ?? "",
        address: company.address ?? "",
      });
      initialized.current = true;
    }
  }, [company, form]);

  if (isLoading)
    return (
      <div className="max-w-4xl mx-auto space-y-6 pb-24">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    );

  function onSubmit(values: FormValues) {
    updateCompany.mutate({
      data: {
        ...values,
        labourRatePerHour: Number(values.labourRatePerHour),
        dayRate: values.dayRate ? Number(values.dayRate) : undefined,
        materialMarkupPercent: Number(values.materialMarkupPercent),
        minimumProjectValue: values.minimumProjectValue
          ? Number(values.minimumProjectValue)
          : undefined,
      } as CompanyInput,
    });
  }

  const hourlyRate = Number(form.watch("labourRatePerHour")) || 0;
  const markup = Number(form.watch("materialMarkupPercent")) || 0;

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-24 animate-in fade-in-0 duration-500">
      {/* Page header */}
      <div className="border-b border-border/60 pb-8">
        <h1 className="text-4xl font-black tracking-tight mb-3">Settings</h1>
        <p className="text-muted-foreground font-semibold text-lg max-w-2xl">
          Manage your business profile and teach the AI how your trade business works.
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">

          {/* ── Business Details ─────────────────────────────────────────── */}
          <Card className="shadow-sm border-border/60 overflow-hidden rounded-2xl bg-card">
            <div className="px-8 py-5 border-b border-border/60 bg-secondary/30 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Building2 className="w-4 h-4 text-primary" />
              </div>
              <div>
                <h2 className="text-base font-bold">Business Details</h2>
                <p className="text-xs text-muted-foreground font-medium">Contact info shown on quotes</p>
              </div>
            </div>
            <CardContent className="p-8 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="field-label">Company Name</FormLabel>
                    <FormControl>
                      <Input className="field-input" placeholder="e.g. Smith Joinery Ltd" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="email" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="field-label">Email</FormLabel>
                    <FormControl>
                      <Input className="field-input" type="email" placeholder="hello@mytradecompany.co.uk" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="phone" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="field-label">Phone</FormLabel>
                    <FormControl>
                      <Input className="field-input" placeholder="07700 900000" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="address" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="field-label">Address</FormLabel>
                    <FormControl>
                      <Input className="field-input" placeholder="123 High Street, Manchester" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </CardContent>
          </Card>

          {/* ── WorkRate Brain ────────────────────────────────────────────── */}
          <Card className="shadow-sm border-primary/20 border-2 overflow-hidden rounded-2xl bg-card relative">
            {/* Glow accent */}
            <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.04] to-transparent pointer-events-none rounded-2xl" />

            <div className="px-8 py-5 border-b border-primary/20 bg-primary/5 flex items-center justify-between relative">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center shadow-md">
                  <Brain className="w-4.5 h-4.5 text-primary-foreground" style={{ width: 18, height: 18 }} />
                </div>
                <div>
                  <h2 className="text-base font-bold flex items-center gap-2">
                    WorkRate Brain
                    <span className="text-[10px] font-bold bg-primary text-primary-foreground px-2 py-0.5 rounded-full uppercase tracking-widest">AI</span>
                  </h2>
                  <p className="text-xs text-muted-foreground font-medium">Used by AI when generating summaries and quotes</p>
                </div>
              </div>
              <Sparkles className="w-5 h-5 text-primary/40" />
            </div>

            <CardContent className="p-8 space-y-8 relative">

              {/* Trade Type */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Wrench className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Trade Type</h3>
                </div>
                <FormField control={form.control} name="tradeType" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="field-label">Your Trade</FormLabel>
                    <FormControl>
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {TRADE_TYPES.map((t) => (
                            <button
                              key={t}
                              type="button"
                              onClick={() => field.onChange(t)}
                              className={`px-3 py-2 rounded-xl text-xs font-bold text-left transition-all border ${
                                field.value === t
                                  ? "bg-primary text-primary-foreground border-primary shadow-md"
                                  : "bg-secondary/60 text-foreground/70 border-border/40 hover:border-primary/30 hover:text-foreground"
                              }`}
                            >
                              {t}
                            </button>
                          ))}
                        </div>
                        <Input
                          className="field-input"
                          placeholder="Or type your trade type…"
                          value={field.value}
                          onChange={field.onChange}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <div className="border-t border-border/40" />

              {/* Rates & Pricing */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <PoundSterling className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Rates & Pricing</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <FormField control={form.control} name="labourRatePerHour" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="field-label">Labour Hourly Rate (£/hr)</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-muted-foreground">£</span>
                          <Input className="field-input pl-8" type="number" min={0} step={0.5} {...field} />
                        </div>
                      </FormControl>
                      {hourlyRate > 0 && (
                        <p className="text-xs font-semibold text-primary mt-1.5">
                          Half-day (4 hrs) = {formatCurrency(hourlyRate * 4)}
                        </p>
                      )}
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="dayRate" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="field-label">Day Rate (£/day) <span className="text-muted-foreground/60 font-normal normal-case tracking-normal">optional</span></FormLabel>
                      <FormControl>
                        <div className="relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-muted-foreground">£</span>
                          <Input
                            className="field-input pl-8"
                            type="number"
                            min={0}
                            step={0.5}
                            placeholder="e.g. 280"
                            value={field.value ?? ""}
                            onChange={(e) => field.onChange(e.target.value === "" ? undefined : e.target.value)}
                          />
                        </div>
                      </FormControl>
                      <p className="text-xs font-semibold text-muted-foreground mt-1.5">Used when quoting multi-day jobs</p>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="materialMarkupPercent" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="field-label">Materials Markup (%)</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input className="field-input pr-8" type="number" min={0} max={100} step={1} {...field} />
                          <span className="absolute right-4 top-1/2 -translate-y-1/2 font-bold text-muted-foreground">%</span>
                        </div>
                      </FormControl>
                      {markup > 0 && (
                        <p className="text-xs font-semibold text-primary mt-1.5">
                          £100 material costs → {formatCurrency(100 * (1 + markup / 100))} on quote
                        </p>
                      )}
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="minimumProjectValue" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="field-label">Minimum Project Value <span className="text-muted-foreground/60 font-normal normal-case tracking-normal">optional</span></FormLabel>
                      <FormControl>
                        <div className="relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-muted-foreground">£</span>
                          <Input
                            className="field-input pl-8"
                            type="number"
                            min={0}
                            step={50}
                            placeholder="e.g. 500"
                            value={field.value ?? ""}
                            onChange={(e) => field.onChange(e.target.value === "" ? undefined : e.target.value)}
                          />
                        </div>
                      </FormControl>
                      <p className="text-xs font-semibold text-muted-foreground mt-1.5">AI will not quote below this amount</p>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
              </div>

              <div className="border-t border-border/40" />

              {/* Operations */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Operations</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <FormField control={form.control} name="serviceArea" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="field-label">
                        <MapPin className="w-3.5 h-3.5 inline mr-1.5" />
                        Service Area
                      </FormLabel>
                      <FormControl>
                        <Input className="field-input" placeholder="e.g. Manchester & 20-mile radius" {...field} />
                      </FormControl>
                      <p className="text-xs text-muted-foreground font-medium mt-1.5">Used by AI to flag out-of-area jobs</p>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="typicalLeadTimes" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="field-label">
                        <Clock className="w-3.5 h-3.5 inline mr-1.5" />
                        Typical Lead Times
                      </FormLabel>
                      <FormControl>
                        <Input className="field-input" placeholder="e.g. 2–3 weeks for new jobs" {...field} />
                      </FormControl>
                      <p className="text-xs text-muted-foreground font-medium mt-1.5">Added to quote notes automatically</p>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                <div className="mt-6">
                  <FormField control={form.control} name="preferredSuppliers" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="field-label">
                        <Package className="w-3.5 h-3.5 inline mr-1.5" />
                        Preferred Suppliers
                      </FormLabel>
                      <FormControl>
                        <Textarea
                          className="field-input resize-none min-h-[80px]"
                          placeholder="e.g. Jewson for timber, Travis Perkins for fixings, local tile merchant for ceramics"
                          {...field}
                        />
                      </FormControl>
                      <p className="text-xs text-muted-foreground font-medium mt-1.5">AI references these when specifying materials on quotes</p>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
              </div>

              {/* Brain preview */}
              <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
                <p className="text-xs font-bold text-primary uppercase tracking-widest mb-2 flex items-center gap-1.5">
                  <Brain className="w-3 h-3" /> What the AI knows about your business
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs font-medium text-foreground/70">
                  {[
                    ["Trade", form.watch("tradeType") || "—"],
                    ["Hourly rate", hourlyRate ? `£${hourlyRate}/hr` : "—"],
                    ["Day rate", form.watch("dayRate") ? `£${form.watch("dayRate")}/day` : "—"],
                    ["Markup", markup ? `${markup}%` : "—"],
                    ["Min job value", form.watch("minimumProjectValue") ? `£${form.watch("minimumProjectValue")}` : "—"],
                    ["Service area", form.watch("serviceArea") || "—"],
                    ["Lead times", form.watch("typicalLeadTimes") || "—"],
                    ["Suppliers", form.watch("preferredSuppliers") ? "Configured ✓" : "—"],
                  ].map(([k, v]) => (
                    <div key={k} className="flex gap-2 py-0.5">
                      <span className="text-muted-foreground w-24 shrink-0">{k}</span>
                      <span className="text-foreground font-semibold truncate">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ── Save button ───────────────────────────────────────────────── */}
          <div className="sticky bottom-8 flex justify-end">
            <Button
              type="submit"
              size="lg"
              className="font-bold hover-elevate shadow-xl h-14 px-10 text-base rounded-2xl"
              disabled={updateCompany.isPending}
            >
              <Save className="w-5 h-5 mr-3" />
              {updateCompany.isPending ? "Saving…" : "Save Settings"}
            </Button>
          </div>
        </form>
      </Form>

      {/* ── Documents & Branding ─────────────────────────────────────────── */}
      <DocumentsBrandingCard />

      {/* ── Chat Widget ─────────────────────────────────────────────────── */}
      <EmbedCodeCard />
    </div>
  );
}

// ── Documents & Branding Card ─────────────────────────────────────────────────
function DocumentsBrandingCard() {
  const { data: company, isLoading } = useGetCompany();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [logoUploading, setLogoUploading] = useLocalState(false);
  const [templateQuoteUploading, setTemplateQuoteUploading] = useLocalState(false);
  const [templateInvoiceUploading, setTemplateInvoiceUploading] = useLocalState(false);
  const [currentLogoUrl, setCurrentLogoUrl] = useLocalState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const templateQuoteInputRef = useRef<HTMLInputElement>(null);
  const templateInvoiceInputRef = useRef<HTMLInputElement>(null);
  const initialized = useRef(false);

  const updateCompany = useUpdateCompany({
    mutation: {
      onSuccess: (data) => {
        toast({ title: "Branding saved" });
        queryClient.setQueryData(["/api/company"], data);
      },
      onError: () => {
        toast({ title: "Failed to save branding", variant: "destructive" });
      },
    },
  });

  const brandingSchema = z.object({
    documentMode: z.enum(["workrate", "custom"]),
    brandColourPrimary: z.string().optional().default("#1E293B"),
    brandColourSecondary: z.string().optional().default("#2563EB"),
    website: z.string().optional().default(""),
    companyRegNumber: z.string().optional().default(""),
    vatNumber: z.string().optional().default(""),
    bankPaymentDetails: z.string().optional().default(""),
    paymentTerms: z.string().optional().default(""),
    termsAndConditions: z.string().optional().default(""),
    quoteFooter: z.string().optional().default(""),
    invoiceFooter: z.string().optional().default(""),
  });
  type BrandingValues = z.infer<typeof brandingSchema>;

  const form = useForm<BrandingValues>({
    resolver: zodResolver(brandingSchema),
    defaultValues: {
      documentMode: "workrate",
      brandColourPrimary: "#1E293B",
      brandColourSecondary: "#2563EB",
      website: "",
      companyRegNumber: "",
      vatNumber: "",
      bankPaymentDetails: "",
      paymentTerms: "",
      termsAndConditions: "",
      quoteFooter: "",
      invoiceFooter: "",
    },
  });

  useEffect(() => {
    if (company && !initialized.current) {
      initialized.current = true;
      setCurrentLogoUrl((company as any).logoUrl ?? null);
      form.reset({
        documentMode: ((company as any).documentMode as "workrate" | "custom") ?? "workrate",
        brandColourPrimary: (company as any).brandColourPrimary ?? "#1E293B",
        brandColourSecondary: (company as any).brandColourSecondary ?? "#2563EB",
        website: (company as any).website ?? "",
        companyRegNumber: (company as any).companyRegNumber ?? "",
        vatNumber: (company as any).vatNumber ?? "",
        bankPaymentDetails: (company as any).bankPaymentDetails ?? "",
        paymentTerms: (company as any).paymentTerms ?? "",
        termsAndConditions: (company as any).termsAndConditions ?? "",
        quoteFooter: (company as any).quoteFooter ?? "",
        invoiceFooter: (company as any).invoiceFooter ?? "",
      });
    }
  }, [company, form]);

  const documentMode = form.watch("documentMode");

  const basePath = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
  const apiBase = `${basePath}/api`;

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${apiBase}/uploads/logo`, { method: "POST", body: fd });
      if (!res.ok) throw new Error("Upload failed");
      const { url } = await res.json();
      setCurrentLogoUrl(url);
      updateCompany.mutate({ data: { logoUrl: url } as any });
    } catch {
      toast({ title: "Logo upload failed", variant: "destructive" });
    } finally {
      setLogoUploading(false);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  }

  async function handleTemplateUpload(
    e: React.ChangeEvent<HTMLInputElement>,
    docType: "quote" | "invoice"
  ) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (docType === "quote") setTemplateQuoteUploading(true);
    else setTemplateInvoiceUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${apiBase}/uploads/template`, { method: "POST", body: fd });
      if (!res.ok) throw new Error("Upload failed");
      await res.json(); // URL stored server-side for reference
      toast({ title: `${docType === "quote" ? "Quote" : "Invoice"} template uploaded`, description: "Saved as a reference — your branding settings above are applied to all documents." });
    } catch {
      toast({ title: "Template upload failed", variant: "destructive" });
    } finally {
      if (docType === "quote") { setTemplateQuoteUploading(false); if (templateQuoteInputRef.current) templateQuoteInputRef.current.value = ""; }
      else { setTemplateInvoiceUploading(false); if (templateInvoiceInputRef.current) templateInvoiceInputRef.current.value = ""; }
    }
  }

  function onSubmit(values: BrandingValues) {
    updateCompany.mutate({ data: values as any });
  }

  if (isLoading) return null;

  return (
    <Card className="shadow-sm border-border/60 overflow-hidden rounded-2xl bg-card">
      <div className="px-8 py-5 border-b border-border/60 bg-secondary/30 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            <Palette className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h2 className="text-base font-bold">Documents &amp; Branding</h2>
            <p className="text-xs text-muted-foreground font-medium">Customise how your quotes and invoices look</p>
          </div>
        </div>
      </div>

      <CardContent className="p-8 space-y-8">
        {/* ── Template Mode Toggle ────────────────────────────────────────── */}
        <div>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4">Document template</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* WorkRate Template */}
            <button
              type="button"
              onClick={() => form.setValue("documentMode", "workrate")}
              className={cn(
                "relative rounded-2xl border-2 p-5 text-left transition-all",
                documentMode === "workrate"
                  ? "border-primary bg-primary/5 shadow-md"
                  : "border-border/50 hover:border-border bg-secondary/20"
              )}
            >
              {documentMode === "workrate" && (
                <CheckCircle2 className="absolute top-3 right-3 w-4 h-4 text-primary" />
              )}
              <div className="w-8 h-8 bg-[#1E293B] rounded-lg flex items-center justify-center mb-3">
                <FileText className="w-4 h-4 text-white" />
              </div>
              <p className="font-bold text-sm">WorkRate Template</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Professional document design. Looks great immediately — no setup required.
              </p>
              {documentMode === "workrate" && (
                <span className="inline-block mt-2 text-[10px] font-bold bg-primary text-primary-foreground px-2 py-0.5 rounded-full uppercase tracking-widest">
                  Active
                </span>
              )}
            </button>

            {/* My Own Branding */}
            <button
              type="button"
              onClick={() => form.setValue("documentMode", "custom")}
              className={cn(
                "relative rounded-2xl border-2 p-5 text-left transition-all",
                documentMode === "custom"
                  ? "border-primary bg-primary/5 shadow-md"
                  : "border-border/50 hover:border-border bg-secondary/20"
              )}
            >
              {documentMode === "custom" && (
                <CheckCircle2 className="absolute top-3 right-3 w-4 h-4 text-primary" />
              )}
              <div className="w-8 h-8 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-lg flex items-center justify-center mb-3">
                <Palette className="w-4 h-4 text-white" />
              </div>
              <p className="font-bold text-sm">My Own Branding</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Apply your logo, colours, and custom footer text to all documents.
              </p>
              {documentMode === "custom" && (
                <span className="inline-block mt-2 text-[10px] font-bold bg-primary text-primary-foreground px-2 py-0.5 rounded-full uppercase tracking-widest">
                  Active
                </span>
              )}
            </button>
          </div>
        </div>

        {/* ── Custom branding fields (only shown when mode = custom) ──────── */}
        {documentMode === "custom" && (
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            {/* Logo */}
            <div>
              <div className="border-t border-border/40 mb-6" />
              <div className="flex items-center gap-2 mb-4">
                <ImageIcon className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Company Logo</h3>
              </div>
              <div className="flex items-start gap-5">
                {/* Logo preview */}
                <div className="w-24 h-24 rounded-xl border-2 border-dashed border-border/60 bg-secondary/30 flex items-center justify-center overflow-hidden shrink-0">
                  {currentLogoUrl ? (
                    <img src={currentLogoUrl} alt="Company logo" className="w-full h-full object-contain p-1" />
                  ) : (
                    <ImageIcon className="w-8 h-8 text-muted-foreground/40" />
                  )}
                </div>
                <div className="space-y-2 flex-1">
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/svg+xml"
                    className="hidden"
                    onChange={handleLogoUpload}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="font-bold rounded-xl border-border/60"
                    disabled={logoUploading}
                    onClick={() => logoInputRef.current?.click()}
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    {logoUploading ? "Uploading…" : currentLogoUrl ? "Replace Logo" : "Upload Logo"}
                  </Button>
                  {currentLogoUrl && (
                    <button
                      type="button"
                      onClick={() => { setCurrentLogoUrl(null); updateCompany.mutate({ data: { logoUrl: "" } as any }); }}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors font-semibold"
                    >
                      <X className="w-3 h-3" /> Remove logo
                    </button>
                  )}
                  <p className="text-xs text-muted-foreground font-medium">PNG, JPG, WebP, or SVG. Max 5 MB. Will appear in the document header.</p>
                </div>
              </div>
            </div>

            {/* Brand Colours */}
            <div>
              <div className="border-t border-border/40 mb-6" />
              <div className="flex items-center gap-2 mb-4">
                <Palette className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Brand Colours</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <FormField control={form.control} name="brandColourPrimary" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="field-label">Primary Colour</FormLabel>
                    <FormControl>
                      <div className="flex items-center gap-3">
                        <input
                          type="color"
                          className="w-10 h-10 rounded-lg cursor-pointer border border-border/60 p-0.5 bg-background"
                          value={field.value ?? "#1E293B"}
                          onChange={(e) => field.onChange(e.target.value)}
                        />
                        <Input
                          className="field-input font-mono flex-1"
                          placeholder="#1E293B"
                          value={field.value ?? ""}
                          onChange={field.onChange}
                        />
                      </div>
                    </FormControl>
                    <p className="text-xs text-muted-foreground font-medium mt-1">Used for the document header background</p>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="brandColourSecondary" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="field-label">Accent Colour</FormLabel>
                    <FormControl>
                      <div className="flex items-center gap-3">
                        <input
                          type="color"
                          className="w-10 h-10 rounded-lg cursor-pointer border border-border/60 p-0.5 bg-background"
                          value={field.value ?? "#2563EB"}
                          onChange={(e) => field.onChange(e.target.value)}
                        />
                        <Input
                          className="field-input font-mono flex-1"
                          placeholder="#2563EB"
                          value={field.value ?? ""}
                          onChange={field.onChange}
                        />
                      </div>
                    </FormControl>
                    <p className="text-xs text-muted-foreground font-medium mt-1">Used for totals row and accents</p>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </div>

            {/* Company Details (extended) */}
            <div>
              <div className="border-t border-border/40 mb-6" />
              <div className="flex items-center gap-2 mb-4">
                <Building2 className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Company &amp; Legal Details</h3>
              </div>
              <p className="text-xs text-muted-foreground font-medium mb-4">These appear in the document header and footer. Company name, address, phone, and email are taken from Business Details above.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <FormField control={form.control} name="website" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="field-label">
                      <Globe className="w-3.5 h-3.5 inline mr-1" />
                      Website
                    </FormLabel>
                    <FormControl>
                      <Input className="field-input" placeholder="https://www.mytradecompany.co.uk" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="companyRegNumber" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="field-label">Company Registration No.</FormLabel>
                    <FormControl>
                      <Input className="field-input" placeholder="e.g. 12345678" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="vatNumber" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="field-label">VAT Registration No.</FormLabel>
                    <FormControl>
                      <Input className="field-input" placeholder="e.g. GB123456789" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </div>

            {/* Payment Information */}
            <div>
              <div className="border-t border-border/40 mb-6" />
              <div className="flex items-center gap-2 mb-4">
                <PoundSterling className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Payment Information</h3>
              </div>
              <div className="space-y-5">
                <FormField control={form.control} name="bankPaymentDetails" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="field-label">Bank / Payment Details</FormLabel>
                    <FormControl>
                      <Textarea
                        className="field-input resize-none min-h-[96px]"
                        placeholder={"e.g.\nAccount name: Smith Joinery Ltd\nSort code: 12-34-56\nAccount number: 12345678\nReference: [Invoice number]"}
                        {...field}
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground font-medium mt-1.5">Shown at the bottom of every invoice and quote</p>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="paymentTerms" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="field-label">Payment Terms</FormLabel>
                    <FormControl>
                      <Input className="field-input" placeholder="e.g. Payment due within 14 days of invoice. 50% deposit required to confirm booking." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </div>

            {/* Document Footers */}
            <div>
              <div className="border-t border-border/40 mb-6" />
              <div className="flex items-center gap-2 mb-4">
                <FileText className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Document Footers</h3>
              </div>
              <div className="space-y-5">
                <FormField control={form.control} name="quoteFooter" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="field-label">Quote Footer</FormLabel>
                    <FormControl>
                      <Textarea
                        className="field-input resize-none min-h-[80px]"
                        placeholder="e.g. This quotation is valid for 30 days. All prices are in GBP and include materials and labour."
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="invoiceFooter" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="field-label">Invoice Footer</FormLabel>
                    <FormControl>
                      <Textarea
                        className="field-input resize-none min-h-[80px]"
                        placeholder="e.g. Thank you for your business. Late payments may be subject to interest under the Late Payment of Commercial Debts Act."
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </div>

            {/* Terms & Conditions */}
            <div>
              <div className="border-t border-border/40 mb-6" />
              <div className="flex items-center gap-2 mb-4">
                <FileText className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Terms &amp; Conditions</h3>
              </div>
              <FormField control={form.control} name="termsAndConditions" render={({ field }) => (
                <FormItem>
                  <FormLabel className="field-label">Full Terms &amp; Conditions</FormLabel>
                  <FormControl>
                    <Textarea
                      className="field-input resize-none min-h-[140px]"
                      placeholder="Paste your full terms and conditions here. These will appear on the final page of every quote and invoice."
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* Reference template upload — clearly explained */}
            <div>
              <div className="border-t border-border/40 mb-6" />
              <div className="flex items-center gap-2 mb-2">
                <Upload className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Reference Templates</h3>
              </div>

              {/* Limitation notice */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 mb-5 flex items-start gap-3">
                <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-bold text-amber-800">How template uploads work</p>
                  <p className="text-xs text-amber-700 mt-1 leading-relaxed font-medium">
                    WorkRate generates your documents using its own layout engine with your branding settings above applied (logo, colours, footer text, etc.). Automatically reading the exact layout of an uploaded PDF or DOCX is unreliable, so WorkRate does not attempt to replicate your existing template's layout.
                  </p>
                  <p className="text-xs text-amber-700 mt-1.5 leading-relaxed font-medium">
                    Upload your current template here as a <strong>reference</strong> — your team can compare it against WorkRate's output and adjust the branding settings above to get as close as possible.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Quote template */}
                <div className="border border-border/50 rounded-xl p-4 space-y-3 bg-secondary/20">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    <p className="text-sm font-bold">Quote Template</p>
                  </div>
                  <p className="text-xs text-muted-foreground font-medium">Your current quote template for reference</p>
                  <input
                    ref={templateQuoteInputRef}
                    type="file"
                    accept=".pdf,.docx,.doc,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    className="hidden"
                    onChange={(e) => handleTemplateUpload(e, "quote")}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full font-bold rounded-xl border-border/60 text-xs"
                    disabled={templateQuoteUploading}
                    onClick={() => templateQuoteInputRef.current?.click()}
                  >
                    <Upload className="w-3.5 h-3.5 mr-2" />
                    {templateQuoteUploading ? "Uploading…" : "Upload PDF or DOCX"}
                  </Button>
                </div>

                {/* Invoice template */}
                <div className="border border-border/50 rounded-xl p-4 space-y-3 bg-secondary/20">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    <p className="text-sm font-bold">Invoice Template</p>
                  </div>
                  <p className="text-xs text-muted-foreground font-medium">Your current invoice template for reference</p>
                  <input
                    ref={templateInvoiceInputRef}
                    type="file"
                    accept=".pdf,.docx,.doc,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    className="hidden"
                    onChange={(e) => handleTemplateUpload(e, "invoice")}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full font-bold rounded-xl border-border/60 text-xs"
                    disabled={templateInvoiceUploading}
                    onClick={() => templateInvoiceInputRef.current?.click()}
                  >
                    <Upload className="w-3.5 h-3.5 mr-2" />
                    {templateInvoiceUploading ? "Uploading…" : "Upload PDF or DOCX"}
                  </Button>
                </div>
              </div>
            </div>

            {/* Save branding */}
            <div className="pt-2 flex justify-end">
              <Button
                type="submit"
                size="lg"
                className="font-bold shadow-xl h-14 px-10 text-base rounded-2xl"
                disabled={updateCompany.isPending}
              >
                <Save className="w-5 h-5 mr-3" />
                {updateCompany.isPending ? "Saving…" : "Save Branding"}
              </Button>
            </div>
          </form>
        )}

        {/* When WorkRate template is selected, show a save button to persist the mode change */}
        {documentMode === "workrate" && (
          <div className="flex justify-end pt-2">
            <Button
              type="button"
              size="lg"
              className="font-bold shadow-xl h-14 px-10 text-base rounded-2xl"
              disabled={updateCompany.isPending}
              onClick={() => updateCompany.mutate({ data: { documentMode: "workrate" } as any })}
            >
              <Save className="w-5 h-5 mr-3" />
              {updateCompany.isPending ? "Saving…" : "Save Template Choice"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Embed Code Card ───────────────────────────────────────────────────────────
function EmbedCodeCard() {
  const [copied, setCopied] = useLocalState(false);
  const { user } = useUser();
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const basePath = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
  const widgetJsUrl = `${origin}${basePath}/widget.js`;
  const widgetPreviewUrl = `${origin}${basePath}/widget`;
  const businessId = user?.id ?? "YOUR_BUSINESS_ID";

  // Detect whether we're on the Replit development preview (*.replit.dev).
  // If so, the snippet below uses the dev URL — warn the user to copy from
  // their PUBLISHED app instead so their website widget hits the live database.
  const isDevUrl =
    typeof window !== "undefined" &&
    window.location.hostname.endsWith(".replit.dev");

  const scriptSnippet =
`<!-- WorkRate Chat Widget -->
<script
  src="${widgetJsUrl}"
  data-business-id="${businessId}"
  defer>
</script>`;

  function copySnippet() {
    navigator.clipboard.writeText(scriptSnippet).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <Card className="shadow-sm border-border/60 rounded-2xl overflow-hidden">
      <div className="px-8 py-5 border-b border-border/60 bg-secondary/30 flex items-center gap-3">
        <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
          <Code2 className="w-4 h-4 text-primary" />
        </div>
        <div>
          <h2 className="text-base font-bold">Chat Widget</h2>
          <p className="text-xs text-muted-foreground font-medium">Embed the WorkRate Assistant on your website</p>
        </div>
      </div>
      <CardContent className="p-8 space-y-6">
        {/* Dev URL warning */}
        {isDevUrl && (
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-5 py-4">
            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-bold text-amber-800">You are viewing the development preview</p>
              <p className="text-xs text-amber-700 mt-1 font-medium leading-relaxed">
                The snippet below uses your <strong>development URL</strong>. Enquiries submitted through a widget installed with this snippet will only appear here in the development preview — not in your published app.
              </p>
              <p className="text-xs text-amber-700 mt-1.5 font-medium leading-relaxed">
                To get the correct snippet for your live website, open <strong>Settings</strong> from your <strong>published WorkRate app</strong> and copy it from there.
              </p>
            </div>
          </div>
        )}

        {/* Preview link */}
        <div className="flex items-center justify-between bg-secondary/40 border border-border/50 rounded-xl px-5 py-4">
          <div>
            <p className="text-sm font-bold">Preview widget</p>
            <p className="text-xs text-muted-foreground mt-0.5">See how the widget looks on your website</p>
          </div>
          <a
            href={widgetPreviewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm font-bold text-primary hover:text-primary/80 transition-colors"
          >
            Open preview <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        {/* How it works */}
        <div className="space-y-3">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">How to embed</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { step: "1", title: "Copy the snippet", desc: "Click the button below to copy your embed code" },
              { step: "2", title: "Paste into your site", desc: "Add it before the closing </body> tag of every page" },
              { step: "3", title: "That's it", desc: "The WorkRate Assistant appears on your site immediately" },
            ].map(({ step, title, desc }) => (
              <div key={step} className="bg-secondary/30 rounded-xl p-4 border border-border/40">
                <div className="w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xs font-black mb-3">{step}</div>
                <p className="text-sm font-bold mb-1">{title}</p>
                <p className="text-xs text-muted-foreground font-medium leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Snippet */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Embed snippet</p>
            <button
              onClick={copySnippet}
              className="flex items-center gap-1.5 text-xs font-bold text-primary hover:text-primary/80 transition-colors px-3 py-1.5 rounded-lg hover:bg-primary/5"
            >
              {copied ? <CheckCheck className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Copied!" : "Copy snippet"}
            </button>
          </div>
          <div className="relative bg-[#0F172A] rounded-xl overflow-hidden border border-border/40">
            <pre className="text-[11px] leading-relaxed text-slate-300 p-5 overflow-x-auto font-mono whitespace-pre">
              <span className="text-slate-500">{`<!-- WorkRate Chat Widget -->`}</span>{"\n"}
              <span className="text-sky-400">{`<script`}</span>{"\n"}
              {"  "}<span className="text-green-400">src</span><span className="text-slate-400">=</span><span className="text-amber-300">{`"${widgetJsUrl}"`}</span>{"\n"}
              {"  "}<span className="text-green-400">data-business-id</span><span className="text-slate-400">=</span><span className="text-amber-300">{`"${businessId}"`}</span>{"\n"}
              {"  "}<span className="text-green-400">defer</span><span className="text-sky-400">{`>`}</span>{"\n"}
              <span className="text-sky-400">{`</script>`}</span>
            </pre>
          </div>
          <p className="text-xs text-muted-foreground font-medium">
            Works on any HTML website, WordPress, Squarespace, Wix, Webflow, and more. No other code needed.
          </p>
        </div>

        {/* Customisation note */}
        <div className="bg-primary/5 border border-primary/20 rounded-xl px-5 py-4 flex items-start gap-3">
          <Sparkles className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-bold text-primary">Customise for your trade</p>
            <p className="text-xs text-muted-foreground mt-1 font-medium">
              The widget reads your WorkRate Brain settings — trade type, service area, and pricing context — so every conversation is tailored to your business.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
