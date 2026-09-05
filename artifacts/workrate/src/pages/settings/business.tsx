/**
 * /settings/business — Business configuration.
 * All UI primitives from @workspace/memphis-bold; formatCurrency stays local.
 */
import { useEffect, useRef, useState as useLocalState } from "react";
import { useGetCompany, useUpdateCompany, type CompanyInput } from "@workspace/api-client-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { companySchema } from "@/lib/schemas";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@workspace/memphis-bold/components/ui/form";
import { Input } from "@workspace/memphis-bold/components/ui/input";
import { Button } from "@workspace/memphis-bold/components/ui/button";
import { Textarea } from "@workspace/memphis-bold/components/ui/textarea";
import { Card, CardContent } from "@workspace/memphis-bold/components/ui/card";
import { Skeleton } from "@workspace/memphis-bold/components/ui/skeleton";
import { cn } from "@workspace/memphis-bold/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/utils";
import { z } from "zod";
import {
  Save, Building2, MapPin, PoundSterling, Brain, Clock, Package, Wrench,
  TrendingUp, Sparkles, Palette, FileText, Upload, X, ImageIcon, CheckCircle2,
} from "lucide-react";
import { CustomerCommsCard } from "@/components/customer-comms-card";
import { SettingsBreadcrumb } from "@/components/settings-breadcrumb";

type FormValues = z.infer<typeof companySchema>;

const TRADE_TYPES = [
  "Joinery", "Building / General Contractor", "Electrical", "Plumbing",
  "Kitchen Installation", "Bathroom Installation", "Plastering", "Roofing",
  "Flooring", "Painting & Decorating", "Landscaping", "HVAC",
];

export default function BusinessSettingsPage() {
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
      name: "", tradeType: "", serviceArea: "", labourRatePerHour: 0,
      dayRate: undefined, materialMarkupPercent: 20, minimumProjectValue: undefined,
      typicalLeadTimes: "", preferredSuppliers: "", email: "", phone: "", address: "",
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

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6 pb-24">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  function onSubmit(values: FormValues) {
    updateCompany.mutate({
      data: {
        ...values,
        labourRatePerHour: Number(values.labourRatePerHour),
        dayRate: values.dayRate ? Number(values.dayRate) : undefined,
        materialMarkupPercent: Number(values.materialMarkupPercent),
        minimumProjectValue: values.minimumProjectValue ? Number(values.minimumProjectValue) : undefined,
      } as CompanyInput,
    });
  }

  const hourlyRate = Number(form.watch("labourRatePerHour")) || 0;
  const markup = Number(form.watch("materialMarkupPercent")) || 0;

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-24 animate-in fade-in-0 duration-500">
      <SettingsBreadcrumb items={[{ label: "Settings", href: "/settings" }, { label: "Business" }]} />

      <div className="border-b border-border pb-8">
        <h1 className="text-3xl font-black tracking-tight mb-2">Business Settings</h1>
        <p className="text-muted-foreground font-medium max-w-2xl">
          Manage your business profile, trade information, rates and document defaults.
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">

          {/* Business Details */}
          <Card className="overflow-hidden">
            <div className="px-8 py-5 border-b border-border bg-secondary/30 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Building2 className="w-4 h-4 text-primary" />
              </div>
              <div>
                <h2 className="text-base font-bold">Business Details</h2>
                <p className="text-xs text-muted-foreground font-medium">Contact info shown on quotes and invoices</p>
              </div>
            </div>
            <CardContent className="p-8 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="field-label">Company Name</FormLabel>
                    <FormControl><Input className="field-input" placeholder="e.g. Smith Joinery Ltd" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="email" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="field-label">Email</FormLabel>
                    <FormControl><Input className="field-input" type="email" placeholder="hello@mytradecompany.co.uk" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="phone" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="field-label">Phone</FormLabel>
                    <FormControl><Input className="field-input" placeholder="07700 900000" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="address" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="field-label">Address</FormLabel>
                    <FormControl><Input className="field-input" placeholder="123 High Street, Manchester" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </CardContent>
          </Card>

          {/* Trade & Services / WorkRate Brain */}
          <Card className="overflow-hidden border-primary/20 border-2 relative">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.04] to-transparent pointer-events-none rounded-xl" />
            <div className="px-8 py-5 border-b border-primary/20 bg-primary/5 flex items-center justify-between relative">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center shadow-md">
                  <Brain className="w-[18px] h-[18px] text-primary-foreground" />
                </div>
                <div>
                  <h2 className="text-base font-bold flex items-center gap-2">
                    Trade & Services
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
                              className={cn(
                                "px-3 py-2 rounded-xl text-xs font-bold text-left transition-all border",
                                field.value === t
                                  ? "bg-primary text-primary-foreground border-primary shadow-md"
                                  : "bg-secondary/60 text-foreground/70 border-border/40 hover:border-primary/30 hover:text-foreground"
                              )}
                            >
                              {t}
                            </button>
                          ))}
                        </div>
                        <Input className="field-input" placeholder="Or type your trade type…" value={field.value} onChange={field.onChange} />
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
                      {hourlyRate > 0 && <p className="text-xs font-semibold text-primary mt-1.5">Half-day (4 hrs) = {formatCurrency(hourlyRate * 4)}</p>}
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="dayRate" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="field-label">Day Rate <span className="text-muted-foreground/60 font-normal normal-case tracking-normal">optional</span></FormLabel>
                      <FormControl>
                        <div className="relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-muted-foreground">£</span>
                          <Input className="field-input pl-8" type="number" min={0} step={0.5} placeholder="e.g. 280"
                            value={field.value ?? ""}
                            onChange={(e) => field.onChange(e.target.value === "" ? undefined : e.target.value)}
                          />
                        </div>
                      </FormControl>
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
                      {markup > 0 && <p className="text-xs font-semibold text-primary mt-1.5">£100 material → {formatCurrency(100 * (1 + markup / 100))} on quote</p>}
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="minimumProjectValue" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="field-label">Min Project Value <span className="text-muted-foreground/60 font-normal normal-case tracking-normal">optional</span></FormLabel>
                      <FormControl>
                        <div className="relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-muted-foreground">£</span>
                          <Input className="field-input pl-8" type="number" min={0} step={50} placeholder="e.g. 500"
                            value={field.value ?? ""}
                            onChange={(e) => field.onChange(e.target.value === "" ? undefined : e.target.value)}
                          />
                        </div>
                      </FormControl>
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
                      <FormLabel className="field-label"><MapPin className="w-3.5 h-3.5 inline mr-1.5" />Service Area</FormLabel>
                      <FormControl><Input className="field-input" placeholder="e.g. Manchester & 20-mile radius" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="typicalLeadTimes" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="field-label"><Clock className="w-3.5 h-3.5 inline mr-1.5" />Typical Lead Times</FormLabel>
                      <FormControl><Input className="field-input" placeholder="e.g. 2–3 weeks for new jobs" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <div className="mt-6">
                  <FormField control={form.control} name="preferredSuppliers" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="field-label"><Package className="w-3.5 h-3.5 inline mr-1.5" />Preferred Suppliers</FormLabel>
                      <FormControl>
                        <Textarea className="field-input resize-none min-h-[80px]" placeholder="e.g. Jewson for timber, Travis Perkins for fixings" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Save */}
          <div className="sticky bottom-8 flex justify-end">
            <Button type="submit" size="lg" className="font-bold shadow-xl" disabled={updateCompany.isPending}>
              <Save className="w-5 h-5 mr-3" />
              {updateCompany.isPending ? "Saving…" : "Save Settings"}
            </Button>
          </div>
        </form>
      </Form>

      {/* Documents & Branding */}
      <BrandingCard />

      {/* Quote & Invoice Defaults */}
      <QuoteInvoiceDefaultsCard />

      {/* Customer Communications */}
      <CustomerCommsCard />
    </div>
  );
}

// ── Branding card ─────────────────────────────────────────────────────────────

function BrandingCard() {
  const { data: company, isLoading } = useGetCompany();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [logoUploading, setLogoUploading] = useLocalState(false);
  const [currentLogoUrl, setCurrentLogoUrl] = useLocalState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const initialized = useRef(false);

  const updateCompany = useUpdateCompany({
    mutation: {
      onSuccess: (data) => {
        toast({ title: "Branding saved" });
        queryClient.setQueryData(["/api/company"], data);
      },
      onError: () => toast({ title: "Failed to save branding", variant: "destructive" }),
    },
  });

  const brandingSchema = z.object({
    documentMode: z.enum(["workrate", "custom"]),
    // Hex colour defaults originate from existing data model — not new inventions
    brandColourPrimary: z.string().optional().default("#1E293B"),
    brandColourSecondary: z.string().optional().default("#0d9488"),
    website: z.string().optional().default(""),
    companyRegNumber: z.string().optional().default(""),
    vatNumber: z.string().optional().default(""),
  });
  type BrandingValues = z.infer<typeof brandingSchema>;

  const form = useForm<BrandingValues>({
    resolver: zodResolver(brandingSchema),
    defaultValues: { documentMode: "workrate", brandColourPrimary: "#1E293B", brandColourSecondary: "#0d9488", website: "", companyRegNumber: "", vatNumber: "" },
  });

  useEffect(() => {
    if (company && !initialized.current) {
      initialized.current = true;
      setCurrentLogoUrl((company as any).logoUrl ?? null);
      form.reset({
        documentMode: ((company as any).documentMode as "workrate" | "custom") ?? "workrate",
        brandColourPrimary: (company as any).brandColourPrimary ?? "#1E293B",
        brandColourSecondary: (company as any).brandColourSecondary ?? "#0d9488",
        website: (company as any).website ?? "",
        companyRegNumber: (company as any).companyRegNumber ?? "",
        vatNumber: (company as any).vatNumber ?? "",
      });
    }
  }, [company, form]);

  const documentMode = form.watch("documentMode");
  const apiBase = `${import.meta.env.BASE_URL?.replace(/\/$/, "") ?? ""}/api`;

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

  if (isLoading) return null;

  function onSubmit(values: BrandingValues) {
    updateCompany.mutate({ data: values as any });
  }

  return (
    <Card className="overflow-hidden">
      <div className="px-8 py-5 border-b border-border bg-secondary/30 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
          <Palette className="w-4 h-4 text-primary" />
        </div>
        <div>
          <h2 className="text-base font-bold">Branding</h2>
          <p className="text-xs text-muted-foreground font-medium">Logo, colours and document appearance</p>
        </div>
      </div>
      <CardContent className="p-8">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Document mode */}
            <div>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4">Document template</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { value: "workrate", label: "WorkRate Template", desc: "Professional template — no setup required." },
                  { value: "custom", label: "My Own Branding", desc: "Apply your logo and colours to all documents." },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => form.setValue("documentMode", opt.value as "workrate" | "custom")}
                    className={cn(
                      "relative rounded-2xl border-2 p-5 text-left transition-all",
                      documentMode === opt.value ? "border-primary bg-primary/5 shadow-md" : "border-border/50 hover:border-border bg-secondary/20"
                    )}
                  >
                    {documentMode === opt.value && <CheckCircle2 className="absolute top-3 right-3 w-4 h-4 text-primary" />}
                    <p className="font-bold text-sm">{opt.label}</p>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{opt.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Logo */}
            <div>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4">Company Logo</p>
              <div className="flex items-start gap-5 flex-wrap">
                <div className="w-24 h-24 rounded-xl border-2 border-dashed border-border/60 bg-secondary/30 flex items-center justify-center overflow-hidden shrink-0">
                  {currentLogoUrl ? (
                    <img src={currentLogoUrl} alt="Company logo" className="w-full h-full object-contain p-1" />
                  ) : (
                    <ImageIcon className="w-8 h-8 text-muted-foreground/40" />
                  )}
                </div>
                <div className="space-y-2 flex-1 min-w-0">
                  <div className="relative inline-block">
                    <Button type="button" variant="outline" className={cn("font-bold", !logoUploading && "pointer-events-none")} disabled={logoUploading}>
                      <Upload className="w-4 h-4 mr-2" />
                      {logoUploading ? "Uploading…" : currentLogoUrl ? "Replace Logo" : "Upload Logo"}
                    </Button>
                    {!logoUploading && (
                      <input ref={logoInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/svg+xml"
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={handleLogoUpload} />
                    )}
                  </div>
                  {currentLogoUrl && (
                    <button type="button"
                      onClick={() => { setCurrentLogoUrl(null); updateCompany.mutate({ data: { logoUrl: "" } as any }); }}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors font-semibold"
                    >
                      <X className="w-3 h-3" /> Remove logo
                    </button>
                  )}
                  <p className="text-xs text-muted-foreground font-medium">PNG, JPG, WebP or SVG. Max 5 MB.</p>
                </div>
              </div>
            </div>

            {/* Brand colours — only shown for custom mode; hex values come from company record */}
            {documentMode === "custom" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <FormField control={form.control} name="brandColourPrimary" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="field-label">Primary Colour</FormLabel>
                    <FormControl>
                      <div className="flex items-center gap-3">
                        <input type="color" className="w-10 h-10 rounded-lg border border-border cursor-pointer shrink-0" {...field} />
                        <Input className="field-input font-mono" {...field} />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="brandColourSecondary" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="field-label">Secondary Colour</FormLabel>
                    <FormControl>
                      <div className="flex items-center gap-3">
                        <input type="color" className="w-10 h-10 rounded-lg border border-border cursor-pointer shrink-0" {...field} />
                        <Input className="field-input font-mono" {...field} />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            )}

            {/* Company reg / VAT */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <FormField control={form.control} name="website" render={({ field }) => (
                <FormItem>
                  <FormLabel className="field-label">Website</FormLabel>
                  <FormControl><Input className="field-input" placeholder="https://mycompany.co.uk" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="companyRegNumber" render={({ field }) => (
                <FormItem>
                  <FormLabel className="field-label">Company Reg. Number</FormLabel>
                  <FormControl><Input className="field-input" placeholder="12345678" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="vatNumber" render={({ field }) => (
                <FormItem>
                  <FormLabel className="field-label">VAT Number</FormLabel>
                  <FormControl><Input className="field-input" placeholder="GB123456789" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <div className="flex justify-end">
              <Button type="submit" className="font-bold" disabled={updateCompany.isPending}>
                <Save className="w-4 h-4 mr-2" />
                {updateCompany.isPending ? "Saving…" : "Save Branding"}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

// ── Quote & Invoice Defaults card ─────────────────────────────────────────────

function QuoteInvoiceDefaultsCard() {
  const { data: company, isLoading } = useGetCompany();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const initialized = useRef(false);

  const updateCompany = useUpdateCompany({
    mutation: {
      onSuccess: (data) => {
        toast({ title: "Defaults saved" });
        queryClient.setQueryData(["/api/company"], data);
      },
      onError: () => toast({ title: "Failed to save", variant: "destructive" }),
    },
  });

  const defaultsSchema = z.object({
    bankPaymentDetails: z.string().optional().default(""),
    paymentTerms: z.string().optional().default(""),
    termsAndConditions: z.string().optional().default(""),
    quoteFooter: z.string().optional().default(""),
    invoiceFooter: z.string().optional().default(""),
    defaultDepositType: z.enum(["none", "percentage", "fixed"]).default("percentage"),
    defaultDepositPercent: z.coerce.number().min(0).max(100).default(50),
    defaultDepositFixed: z.coerce.number().min(0).optional(),
    depositPaymentInstructions: z.string().optional().default(""),
    remainingBalanceDueDays: z.coerce.number().min(0).default(30),
  });
  type DefaultsValues = z.infer<typeof defaultsSchema>;

  const form = useForm<DefaultsValues>({
    resolver: zodResolver(defaultsSchema),
    defaultValues: {
      bankPaymentDetails: "", paymentTerms: "", termsAndConditions: "",
      quoteFooter: "", invoiceFooter: "",
      defaultDepositType: "percentage", defaultDepositPercent: 50,
      defaultDepositFixed: undefined, depositPaymentInstructions: "",
      remainingBalanceDueDays: 30,
    },
  });

  useEffect(() => {
    if (company && !initialized.current) {
      initialized.current = true;
      form.reset({
        bankPaymentDetails: (company as any).bankPaymentDetails ?? "",
        paymentTerms: (company as any).paymentTerms ?? "",
        termsAndConditions: (company as any).termsAndConditions ?? "",
        quoteFooter: (company as any).quoteFooter ?? "",
        invoiceFooter: (company as any).invoiceFooter ?? "",
        defaultDepositType: ((company as any).defaultDepositType ?? "percentage") as "none" | "percentage" | "fixed",
        defaultDepositPercent: (company as any).defaultDepositPercent ?? 50,
        defaultDepositFixed: (company as any).defaultDepositFixed ?? undefined,
        depositPaymentInstructions: (company as any).depositPaymentInstructions ?? "",
        remainingBalanceDueDays: (company as any).remainingBalanceDueDays ?? 30,
      });
    }
  }, [company, form]);

  const depositType = form.watch("defaultDepositType");

  if (isLoading) return null;

  function onSubmit(values: DefaultsValues) {
    updateCompany.mutate({ data: values as any });
  }

  return (
    <Card className="overflow-hidden">
      <div className="px-8 py-5 border-b border-border bg-secondary/30 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
          <FileText className="w-4 h-4 text-primary" />
        </div>
        <div>
          <h2 className="text-base font-bold">Quote & Invoice Defaults</h2>
          <p className="text-xs text-muted-foreground font-medium">Payment terms, deposit settings and footer text</p>
        </div>
      </div>
      <CardContent className="p-8">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Deposit settings */}
            <div>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4">Deposit Settings</p>
              <div className="grid grid-cols-3 gap-2 mb-4">
                {(["none", "percentage", "fixed"] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => form.setValue("defaultDepositType", type)}
                    className={cn(
                      "px-3 py-2 rounded-xl text-xs font-bold text-center transition-all border",
                      depositType === type ? "bg-primary text-primary-foreground border-primary" : "bg-secondary/60 border-border/40 hover:border-primary/30"
                    )}
                  >
                    {type === "none" ? "No Deposit" : type === "percentage" ? "Percentage" : "Fixed Amount"}
                  </button>
                ))}
              </div>

              {depositType === "percentage" && (
                <FormField control={form.control} name="defaultDepositPercent" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="field-label">Deposit Percentage</FormLabel>
                    <FormControl>
                      <div className="relative w-48">
                        <Input className="field-input pr-8" type="number" min={0} max={100} step={5} {...field} />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 font-bold text-muted-foreground">%</span>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              )}
              {depositType === "fixed" && (
                <FormField control={form.control} name="defaultDepositFixed" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="field-label">Fixed Deposit Amount</FormLabel>
                    <FormControl>
                      <div className="relative w-48">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-muted-foreground">£</span>
                        <Input className="field-input pl-8" type="number" min={0} step={50}
                          value={field.value ?? ""} onChange={(e) => field.onChange(e.target.value === "" ? undefined : e.target.value)} />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <FormField control={form.control} name="remainingBalanceDueDays" render={({ field }) => (
                <FormItem>
                  <FormLabel className="field-label">Balance Due (days)</FormLabel>
                  <FormControl><Input className="field-input" type="number" min={0} {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="paymentTerms" render={({ field }) => (
                <FormItem>
                  <FormLabel className="field-label">Payment Terms</FormLabel>
                  <FormControl><Input className="field-input" placeholder="e.g. 30 days net" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <FormField control={form.control} name="depositPaymentInstructions" render={({ field }) => (
              <FormItem>
                <FormLabel className="field-label">Deposit Payment Instructions</FormLabel>
                <FormControl>
                  <Textarea className="field-input resize-none min-h-[80px]" placeholder="e.g. Pay via bank transfer to…" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="bankPaymentDetails" render={({ field }) => (
              <FormItem>
                <FormLabel className="field-label">Bank Payment Details</FormLabel>
                <FormControl>
                  <Textarea className="field-input resize-none min-h-[80px]" placeholder="Sort code, account number…" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <FormField control={form.control} name="quoteFooter" render={({ field }) => (
                <FormItem>
                  <FormLabel className="field-label">Quote Footer Text</FormLabel>
                  <FormControl><Textarea className="field-input resize-none min-h-[80px]" placeholder="Text printed at the bottom of quotes" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="invoiceFooter" render={({ field }) => (
                <FormItem>
                  <FormLabel className="field-label">Invoice Footer Text</FormLabel>
                  <FormControl><Textarea className="field-input resize-none min-h-[80px]" placeholder="Text printed at the bottom of invoices" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <FormField control={form.control} name="termsAndConditions" render={({ field }) => (
              <FormItem>
                <FormLabel className="field-label">Terms & Conditions</FormLabel>
                <FormControl>
                  <Textarea className="field-input resize-none min-h-[120px]" placeholder="Your standard terms and conditions…" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <div className="flex justify-end">
              <Button type="submit" className="font-bold" disabled={updateCompany.isPending}>
                <Save className="w-4 h-4 mr-2" />
                {updateCompany.isPending ? "Saving…" : "Save Defaults"}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
