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
import { Save, Building2, MapPin, PoundSterling, Brain, Users, Clock, Package, Wrench, TrendingUp, Sparkles } from "lucide-react";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/utils";

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
    </div>
  );
}
