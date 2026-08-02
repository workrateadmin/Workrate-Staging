import { useGetCompany, useUpdateCompany, type CompanyInput } from "@workspace/api-client-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { companySchema } from "@/lib/schemas";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useRef } from "react";
import { Save, Building2 } from "lucide-react";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";

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
        name: company.name,
        tradeType: company.tradeType,
        serviceArea: company.serviceArea,
        labourRatePerHour: company.labourRatePerHour,
        materialMarkupPercent: company.materialMarkupPercent,
        preferredSuppliers: company.preferredSuppliers || "",
        email: company.email || "",
        phone: company.phone || "",
        address: company.address || "",
      });
      initialized.current = true;
    }
  }, [company, form]);

  if (isLoading) return <div className="p-8"><Skeleton className="h-[600px] w-full max-w-2xl" /></div>;

  function onSubmit(values: FormValues) {
    updateCompany.mutate({ data: values as CompanyInput });
  }

  return (
    <div className="max-w-2xl space-y-8 pb-24">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Company Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your business profile and default rates.</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card className="shadow-sm border-border/50">
            <CardHeader className="bg-secondary/30 border-b">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Building2 className="w-5 h-5 text-primary" /> Profile
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Company Name</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="tradeType" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Trade Type</FormLabel>
                    <FormControl><Input placeholder="e.g. Joinery, Plumbing" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="serviceArea" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Service Area</FormLabel>
                    <FormControl><Input placeholder="e.g. London" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="email" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contact Email</FormLabel>
                    <FormControl><Input type="email" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="phone" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone Number</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <FormField control={form.control} name="address" render={({ field }) => (
                <FormItem>
                  <FormLabel>Business Address</FormLabel>
                  <FormControl><Textarea rows={2} {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </CardContent>
          </Card>

          <Card className="shadow-sm border-border/50">
            <CardHeader className="bg-secondary/30 border-b">
              <CardTitle className="text-lg">Pricing Defaults</CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="labourRatePerHour" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Labour Rate (£/hr)</FormLabel>
                    <FormControl><Input type="number" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="materialMarkupPercent" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Materials Markup (%)</FormLabel>
                    <FormControl><Input type="number" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="preferredSuppliers" render={({ field }) => (
                <FormItem>
                  <FormLabel>Preferred Suppliers</FormLabel>
                  <FormControl><Textarea rows={2} placeholder="e.g. Howdens, Screwfix" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </CardContent>
          </Card>

          <Button type="submit" className="w-full sm:w-auto hover-elevate h-11 px-8" disabled={updateCompany.isPending}>
            <Save className="w-4 h-4 mr-2" />
            {updateCompany.isPending ? "Saving..." : "Save Settings"}
          </Button>
        </form>
      </Form>
    </div>
  );
}
