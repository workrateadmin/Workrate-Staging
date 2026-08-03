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
import { Save, Building2, UploadCloud, MapPin, PoundSterling } from "lucide-react";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/utils";

type FormValues = z.infer<typeof companySchema>;

export default function Settings() {
  const { data: company, isLoading } = useGetCompany();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const updateCompany = useUpdateCompany({
    mutation: {
      onSuccess: (data) => {
        toast({ title: "Settings saved successfully" });
        queryClient.setQueryData(["/api/company"], data);
      },
      onError: () => {
        toast({ title: "Failed to save settings", variant: "destructive" });
      }
    }
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(companySchema),
    defaultValues: {
      name: "",
      tradeType: "",
      serviceArea: "",
      labourRatePerHour: 0,
      materialMarkupPercent: 0,
      preferredSuppliers: "",
      email: "",
      phone: "",
      address: "",
    }
  });

  const initialized = useRef(false);

  useEffect(() => {
    if (company && !initialized.current) {
      form.reset({
        name: company.name || "",
        tradeType: company.tradeType || "",
        serviceArea: company.serviceArea || "",
        labourRatePerHour: company.labourRatePerHour || 0,
        materialMarkupPercent: company.materialMarkupPercent || 0,
        preferredSuppliers: company.preferredSuppliers || "",
        email: company.email || "",
        phone: company.phone || "",
        address: company.address || "",
      });
      initialized.current = true;
    }
  }, [company, form]);

  if (isLoading) return <div className="p-8 max-w-4xl mx-auto"><Skeleton className="h-[600px] w-full rounded-2xl" /></div>;

  function onSubmit(values: FormValues) {
    updateCompany.mutate({
      data: {
        ...values,
        labourRatePerHour: Number(values.labourRatePerHour),
        materialMarkupPercent: Number(values.materialMarkupPercent),
      } as CompanyInput
    });
  }

  const currentRate = Number(form.watch("labourRatePerHour")) || 0;
  const exampleJob = currentRate * 4;

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-24 animate-in fade-in-0 duration-500">
      <div className="border-b border-border/60 pb-8 mb-8">
        <h1 className="text-4xl font-black tracking-tight mb-3">Company Profile</h1>
        <p className="text-muted-foreground font-semibold text-lg max-w-2xl">Configure how your business appears to customers and set your pricing defaults for AI quotes.</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 relative">
          
          <Card className="shadow-sm border-border/60 overflow-hidden rounded-2xl bg-card">
            <div className="px-8 py-5 border-b border-border/60 bg-secondary/30">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Building2 className="w-5 h-5 text-primary" /> Business Details
              </h2>
            </div>
            <CardContent className="p-8 space-y-8">
              <div className="flex flex-col sm:flex-row gap-8 items-start">
                <div className="w-32 h-32 shrink-0 rounded-2xl border-2 border-dashed border-border/80 flex flex-col items-center justify-center text-muted-foreground hover:border-primary hover:text-primary hover:bg-primary/5 transition-all cursor-pointer group bg-secondary/20 shadow-sm">
                  <UploadCloud className="w-8 h-8 mb-2 group-hover:scale-110 transition-transform duration-300" />
                  <span className="text-xs font-bold uppercase tracking-widest">Logo</span>
                </div>
                <div className="flex-1 space-y-6 w-full">
                  <FormField control={form.control} name="name" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-bold text-sm uppercase tracking-widest text-muted-foreground">Company Name</FormLabel>
                      <FormControl><Input className="bg-background h-12 font-semibold text-lg border-border/60 rounded-xl" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                <FormField control={form.control} name="tradeType" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-bold text-sm uppercase tracking-widest text-muted-foreground">Trade Type</FormLabel>
                    <FormControl><Input className="bg-background h-12 font-medium border-border/60 rounded-xl" placeholder="e.g. Joinery, Plumbing" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="serviceArea" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-bold text-sm uppercase tracking-widest text-muted-foreground">Service Area</FormLabel>
                    <FormControl><Input className="bg-background h-12 font-medium border-border/60 rounded-xl" placeholder="e.g. London & South East" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-border/60 overflow-hidden rounded-2xl bg-card">
            <div className="px-8 py-5 border-b border-border/60 bg-secondary/30">
              <h2 className="text-lg font-bold flex items-center gap-2">
                 <MapPin className="w-5 h-5 text-primary" /> Contact & Location
              </h2>
            </div>
            <CardContent className="p-8 space-y-8">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                <FormField control={form.control} name="email" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-bold text-sm uppercase tracking-widest text-muted-foreground">Contact Email</FormLabel>
                    <FormControl><Input className="bg-background h-12 font-medium border-border/60 rounded-xl" type="email" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="phone" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-bold text-sm uppercase tracking-widest text-muted-foreground">Phone Number</FormLabel>
                    <FormControl><Input className="bg-background h-12 font-medium border-border/60 rounded-xl" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <FormField control={form.control} name="address" render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-bold text-sm uppercase tracking-widest text-muted-foreground">Business Address</FormLabel>
                  <FormControl><Textarea className="bg-background resize-none border-border/60 rounded-xl p-4 font-medium" rows={3} {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </CardContent>
          </Card>

          <Card className="shadow-sm border-border/60 overflow-hidden rounded-2xl bg-card">
            <div className="px-8 py-5 border-b border-border/60 bg-secondary/30">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <PoundSterling className="w-5 h-5 text-primary" /> Pricing Defaults
              </h2>
            </div>
            <CardContent className="p-8 space-y-8">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                <FormField control={form.control} name="labourRatePerHour" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-bold text-sm uppercase tracking-widest text-muted-foreground">Labour Rate (£/hr)</FormLabel>
                    <FormControl>
                      <Input className="bg-background h-12 font-bold text-lg border-border/60 rounded-xl" type="number" {...field} />
                    </FormControl>
                    {currentRate > 0 && (
                      <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 mt-3">
                         <p className="text-sm font-semibold text-foreground/80">
                           AI quotes will estimate <span className="text-primary font-bold">{formatCurrency(exampleJob)}</span> for a typical half-day (4hr) job.
                         </p>
                      </div>
                    )}
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="materialMarkupPercent" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-bold text-sm uppercase tracking-widest text-muted-foreground">Materials Markup (%)</FormLabel>
                    <FormControl><Input className="bg-background h-12 font-bold text-lg border-border/60 rounded-xl" type="number" {...field} /></FormControl>
                    <p className="text-sm font-semibold text-muted-foreground mt-3">Automatically added to cost prices generated by AI on quotes.</p>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </CardContent>
          </Card>

          <div className="sticky bottom-8 mt-12 flex justify-end">
            <Button type="submit" size="lg" className="w-full sm:w-auto font-bold hover-elevate shadow-xl h-14 px-10 text-lg rounded-2xl" disabled={updateCompany.isPending}>
              <Save className="w-5 h-5 mr-3" />
              {updateCompany.isPending ? "Saving..." : "Save Settings"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}