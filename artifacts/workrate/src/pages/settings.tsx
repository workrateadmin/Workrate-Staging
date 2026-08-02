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
import { Save, Building2, UploadCloud } from "lucide-react";
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

  if (isLoading) return <div className="p-8 max-w-3xl mx-auto"><Skeleton className="h-[600px] w-full" /></div>;

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
    <div className="max-w-3xl mx-auto space-y-8 pb-24 animate-in fade-in-0 duration-500">
      <div className="border-b border-border/50 pb-6">
        <h1 className="text-3xl font-black tracking-tight mb-1">Company Profile</h1>
        <p className="text-muted-foreground font-medium">How your business appears to customers and on quotes.</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 relative">
          
          <Card className="shadow-sm border-border/50 overflow-hidden">
            <div className="px-6 py-4 border-b border-border/40 bg-secondary/30">
              <h2 className="text-base font-bold flex items-center gap-2">
                <Building2 className="w-5 h-5 text-primary" /> Business Details
              </h2>
            </div>
            <CardContent className="p-6 space-y-6">
              <div className="flex flex-col sm:flex-row gap-6 items-start">
                <div className="w-24 h-24 shrink-0 rounded-xl border-2 border-dashed border-border/80 flex flex-col items-center justify-center text-muted-foreground hover:border-primary hover:text-primary transition-colors cursor-pointer group bg-secondary/20">
                  <UploadCloud className="w-6 h-6 mb-1 group-hover:scale-110 transition-transform" />
                  <span className="text-[10px] font-bold uppercase tracking-wide">Upload Logo</span>
                </div>
                <div className="flex-1 space-y-4 w-full">
                  <FormField control={form.control} name="name" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-semibold">Company Name</FormLabel>
                      <FormControl><Input className="bg-card" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <FormField control={form.control} name="tradeType" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-semibold">Trade Type</FormLabel>
                    <FormControl><Input className="bg-card" placeholder="e.g. Joinery, Plumbing" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="serviceArea" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-semibold">Service Area</FormLabel>
                    <FormControl><Input className="bg-card" placeholder="e.g. London & South East" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-border/50 overflow-hidden">
            <div className="px-6 py-4 border-b border-border/40 bg-secondary/30">
              <h2 className="text-base font-bold">Contact & Location</h2>
            </div>
            <CardContent className="p-6 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <FormField control={form.control} name="email" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-semibold">Contact Email</FormLabel>
                    <FormControl><Input className="bg-card" type="email" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="phone" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-semibold">Phone Number</FormLabel>
                    <FormControl><Input className="bg-card" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <FormField control={form.control} name="address" render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-semibold">Business Address</FormLabel>
                  <FormControl><Textarea className="bg-card resize-none" rows={3} {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </CardContent>
          </Card>

          <Card className="shadow-sm border-border/50 overflow-hidden">
            <div className="px-6 py-4 border-b border-border/40 bg-secondary/30">
              <h2 className="text-base font-bold">Pricing Defaults</h2>
            </div>
            <CardContent className="p-6 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <FormField control={form.control} name="labourRatePerHour" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-semibold">Labour Rate (£/hr)</FormLabel>
                    <FormControl>
                      <Input className="bg-card" type="number" {...field} />
                    </FormControl>
                    {currentRate > 0 && (
                      <p className="text-sm font-medium text-muted-foreground mt-2">
                        e.g. A 4-hour job at this rate = <span className="text-foreground">{formatCurrency(exampleJob)}</span>
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="materialMarkupPercent" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-semibold">Materials Markup (%)</FormLabel>
                    <FormControl><Input className="bg-card" type="number" {...field} /></FormControl>
                    <p className="text-sm font-medium text-muted-foreground mt-2">Added to cost price on quotes</p>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </CardContent>
          </Card>

          <div className="sticky bottom-6 mt-8 flex justify-end">
            <Button type="submit" size="lg" className="w-full sm:w-auto font-semibold hover-elevate shadow-lg h-12 px-8" disabled={updateCompany.isPending}>
              <Save className="w-4 h-4 mr-2" />
              {updateCompany.isPending ? "Saving..." : "Save Settings"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
