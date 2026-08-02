import { useGetQuote, useUpdateQuote, useGetEnquiry, getGetQuoteQueryKey, getGetEnquiryQueryKey } from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { quoteSchema } from "@/lib/schemas";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Save, Sparkles, Send } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";

type QuoteFormValues = z.infer<typeof quoteSchema>;

export default function QuoteEditor() {
  const params = useParams();
  const id = Number(params.id);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: quote, isLoading: isLoadingQuote } = useGetQuote(id, { query: { enabled: !!id, queryKey: getGetQuoteQueryKey(id) } });
  const { data: enquiry } = useGetEnquiry(id, { query: { enabled: !!id, queryKey: getGetEnquiryQueryKey(id) } });

  const updateQuote = useUpdateQuote({
    mutation: {
      onSuccess: (data) => {
        toast({ title: "Quote saved successfully" });
        queryClient.setQueryData([`/api/enquiries/${id}/quote`], data);
      },
      onError: () => {
        toast({ title: "Failed to save quote", variant: "destructive" });
      }
    }
  });

  const form = useForm<QuoteFormValues>({
    resolver: zodResolver(quoteSchema),
    defaultValues: {
      customerDetails: "",
      projectDescription: "",
      materialsAllowance: 0,
      labourAllowance: 0,
      vatAmount: 0,
      notes: "",
      assumptions: "",
      status: "draft"
    }
  });

  const initialized = useRef(false);

  useEffect(() => {
    if (quote && !initialized.current) {
      form.reset({
        customerDetails: quote.customerDetails || "",
        projectDescription: quote.projectDescription || "",
        materialsAllowance: quote.materialsAllowance,
        labourAllowance: quote.labourAllowance,
        vatAmount: quote.vatAmount,
        notes: quote.notes || "",
        assumptions: quote.assumptions || "",
        status: quote.status as any,
      });
      initialized.current = true;
    }
  }, [quote, form]);

  if (isLoadingQuote) return <div className="p-8 max-w-4xl mx-auto"><Skeleton className="h-[600px] w-full" /></div>;

  if (!quote) return <div className="p-8 text-center text-muted-foreground font-medium">Quote not found. <Link href={`/enquiries/${id}`} className="text-primary hover:underline">Back to enquiry</Link></div>;

  const materials = Number(form.watch("materialsAllowance")) || 0;
  const labour = Number(form.watch("labourAllowance")) || 0;
  const subtotal = materials + labour;
  const vat = Number(form.watch("vatAmount")) || 0;
  const total = subtotal + vat;

  function onSubmit(values: QuoteFormValues) {
    updateQuote.mutate({
      id: id,
      data: {
        ...values,
        materialsAllowance: Number(values.materialsAllowance),
        labourAllowance: Number(values.labourAllowance),
        vatAmount: Number(values.vatAmount),
        estimatedTotal: subtotal,
        totalWithVat: total
      }
    });
  }

  function handleMarkAsSent() {
    form.setValue("status", "sent");
    form.handleSubmit(onSubmit)();
  }

  return (
    <div className="max-w-4xl mx-auto pb-24 space-y-6 animate-in fade-in-0 duration-500">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Link href={`/enquiries/${id}`} className="hover:text-primary flex items-center gap-1 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Enquiry
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-border/50 pb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-3xl font-black tracking-tight">Quote #ENQ-{id}</h1>
            <span className={`px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider border ${form.watch("status") === "sent" ? "bg-violet-100 text-violet-800 border-violet-200" : "bg-gray-100 text-gray-800 border-gray-200"}`}>
              {form.watch("status")}
            </span>
          </div>
          <p className="text-muted-foreground font-medium">For {enquiry?.customerName || "Customer"}</p>
        </div>
        <div className="flex items-center gap-3">
          <Button type="button" variant="outline" onClick={() => form.handleSubmit(onSubmit)()} disabled={updateQuote.isPending} className="font-semibold bg-card">
            <Save className="w-4 h-4 mr-2"/> Save Draft
          </Button>
          <Button type="button" onClick={handleMarkAsSent} disabled={updateQuote.isPending} className="font-semibold shadow-sm hover-elevate">
            <Send className="w-4 h-4 mr-2"/> Mark as Sent
          </Button>
        </div>
      </div>

      <Form {...form}>
        <form className="space-y-8">
          {/* Customer Section */}
          <div className="bg-secondary/30 p-5 rounded-xl border border-border/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Customer Details</p>
              <p className="font-semibold text-lg">{enquiry?.customerName}</p>
              <p className="text-sm text-muted-foreground">{enquiry?.customerEmail} • {enquiry?.customerPhone}</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Location</p>
              <p className="text-sm font-medium">{enquiry?.location || "No location provided"}</p>
            </div>
          </div>

          <Card className="shadow-sm border-border/50 overflow-hidden">
            <CardContent className="p-0">
              <div className="p-6 border-b border-border/40">
                <FormField
                  control={form.control}
                  name="projectDescription"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base font-bold">Project Description</FormLabel>
                      <FormControl>
                        <Textarea rows={4} className="bg-card resize-none mt-2" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Financials Section */}
              <div className="p-6 bg-secondary/5">
                <h3 className="text-base font-bold mb-4">Financial Breakdown</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                  <FormField
                    control={form.control}
                    name="materialsAllowance"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Materials (£)</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" className="text-lg font-medium bg-card" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="labourAllowance"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Labour (£)</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" className="text-lg font-medium bg-card" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="space-y-2">
                    <FormLabel className="text-sm font-semibold text-muted-foreground uppercase tracking-wider block">Subtotal</FormLabel>
                    <div className="h-10 flex items-center text-xl font-bold px-3">
                      {formatCurrency(subtotal)}
                    </div>
                  </div>
                </div>

                <div className="border-t border-border/40 pt-6 flex flex-col items-end space-y-4">
                  <div className="w-full sm:w-64">
                    <FormField
                      control={form.control}
                      name="vatAmount"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between gap-4 space-y-0">
                          <FormLabel className="text-sm font-semibold text-muted-foreground">VAT 20% (£)</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.01" className="w-32 text-right bg-card font-medium" {...field} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <div className="w-full sm:w-72 bg-sidebar text-sidebar-foreground p-5 rounded-xl shadow-md flex items-center justify-between">
                    <span className="font-bold text-sidebar-foreground/80 uppercase tracking-wider text-sm">Total inc. VAT</span>
                    <span className="text-3xl font-black text-primary">{formatCurrency(total)}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-bold">Additional Notes</FormLabel>
                  <FormControl>
                    <Textarea rows={4} className="bg-card resize-none" placeholder="Special requirements, timescales..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="assumptions"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-bold">Assumptions / Exclusions</FormLabel>
                  <FormControl>
                    <Textarea rows={4} className="bg-card resize-none" placeholder="What is not included in this quote..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="flex justify-start border-t border-border/50 pt-8">
            <Button type="button" variant="outline" className="font-semibold hover-elevate">
              <Sparkles className="w-4 h-4 mr-2 text-primary" />
              Re-generate with AI
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
