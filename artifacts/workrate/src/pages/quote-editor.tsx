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
import { ArrowLeft, Save, Sparkles, Send, Receipt, FileText } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useEffect, useRef } from "react";
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

  if (isLoadingQuote) return <div className="p-8 max-w-5xl mx-auto"><Skeleton className="h-[600px] w-full rounded-2xl" /></div>;

  if (!quote) return <div className="p-16 text-center text-muted-foreground font-bold text-lg bg-card rounded-2xl border border-border/60 max-w-3xl mx-auto mt-12 shadow-sm">Quote not found. <Link href={`/enquiries/${id}`} className="text-primary hover:underline ml-2">Back to enquiry</Link></div>;

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
    <div className="max-w-5xl mx-auto pb-24 space-y-8 animate-in fade-in-0 duration-500">
      <div className="flex items-center gap-2 text-sm font-bold text-muted-foreground">
        <Link href={`/enquiries/${id}`} className="hover:text-foreground flex items-center gap-1.5 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Enquiry Details
        </Link>
      </div>

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-border/60 pb-8">
        <div>
          <div className="flex items-center gap-4 mb-2">
            <h1 className="text-4xl font-black tracking-tight">Quote #ENQ-{id}</h1>
            <span className={`px-3 py-1 rounded-md text-xs font-bold uppercase tracking-widest border shadow-sm ${form.watch("status") === "sent" ? "bg-violet-50 text-violet-700 border-violet-200" : "bg-gray-50 text-gray-700 border-gray-200"}`}>
              {form.watch("status")}
            </span>
          </div>
          <p className="text-muted-foreground font-semibold text-lg">Prepared for <span className="text-foreground">{enquiry?.customerName || "Customer"}</span></p>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <Button type="button" variant="outline" onClick={() => form.handleSubmit(onSubmit)()} disabled={updateQuote.isPending} className="font-bold bg-background border-border/60 hover:bg-secondary flex-1 md:flex-none h-12 px-6 rounded-xl">
            <Save className="w-4 h-4 mr-2"/> Save Draft
          </Button>
          <Button type="button" onClick={handleMarkAsSent} disabled={updateQuote.isPending} className="font-bold shadow-md hover-elevate flex-1 md:flex-none h-12 px-6 rounded-xl">
            <Send className="w-4 h-4 mr-2"/> Mark as Sent
          </Button>
        </div>
      </div>

      <Form {...form}>
        <form className="space-y-8">
          <Card className="shadow-sm border-border/60 overflow-hidden rounded-2xl bg-card">
            <div className="px-8 py-5 border-b border-border/60 bg-secondary/30 flex items-center gap-2">
              <FileText className="w-5 h-5 text-muted-foreground" />
              <h2 className="font-bold text-lg">Project Scope</h2>
            </div>
            <CardContent className="p-8">
              <FormField
                control={form.control}
                name="projectDescription"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Textarea rows={6} className="bg-background resize-none border-border/60 text-base p-4 font-medium rounded-xl focus-visible:ring-primary/20" placeholder="Detailed description of works..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card className="shadow-sm border-border/60 overflow-hidden rounded-2xl bg-card">
            <div className="px-8 py-5 border-b border-border/60 bg-secondary/30 flex items-center gap-2">
              <Receipt className="w-5 h-5 text-muted-foreground" />
              <h2 className="font-bold text-lg">Financial Breakdown</h2>
            </div>
            <CardContent className="p-0">
              <div className="p-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                  <div className="space-y-8">
                    <FormField
                      control={form.control}
                      name="materialsAllowance"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Materials Allowance (£)</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.01" className="text-xl font-bold bg-background h-14 border-border/60 rounded-xl focus-visible:ring-primary/20 px-4" {...field} />
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
                          <FormLabel className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Labour Allowance (£)</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.01" className="text-xl font-bold bg-background h-14 border-border/60 rounded-xl focus-visible:ring-primary/20 px-4" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="vatAmount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-bold text-muted-foreground uppercase tracking-widest">VAT Amount (£)</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.01" className="text-xl font-bold bg-background h-14 border-border/60 rounded-xl focus-visible:ring-primary/20 px-4" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Totals Summary */}
                  <div className="bg-secondary/40 rounded-2xl p-8 border border-border/40 flex flex-col justify-center space-y-6">
                    <div className="flex items-center justify-between border-b border-border/60 pb-4">
                      <span className="font-bold text-muted-foreground text-lg">Subtotal</span>
                      <span className="font-black text-2xl">{formatCurrency(subtotal)}</span>
                    </div>
                    <div className="flex items-center justify-between border-b border-border/60 pb-4">
                      <span className="font-bold text-muted-foreground text-lg">VAT (20%)</span>
                      <span className="font-black text-2xl">{formatCurrency(vat)}</span>
                    </div>
                    <div className="flex items-center justify-between bg-sidebar text-sidebar-foreground p-6 rounded-xl shadow-md mt-4">
                      <span className="font-bold text-sidebar-foreground/80 uppercase tracking-widest text-sm">Total inc. VAT</span>
                      <span className="text-4xl font-black text-primary">{formatCurrency(total)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <Card className="shadow-sm border-border/60 rounded-2xl bg-card">
              <CardContent className="p-6">
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-bold text-lg mb-3 block">Additional Notes</FormLabel>
                      <FormControl>
                        <Textarea rows={5} className="bg-background resize-none border-border/60 rounded-xl focus-visible:ring-primary/20 font-medium" placeholder="Special requirements, timescales..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
            
            <Card className="shadow-sm border-border/60 rounded-2xl bg-card">
              <CardContent className="p-6">
                <FormField
                  control={form.control}
                  name="assumptions"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-bold text-lg mb-3 block">Assumptions / Exclusions</FormLabel>
                      <FormControl>
                        <Textarea rows={5} className="bg-background resize-none border-border/60 rounded-xl focus-visible:ring-primary/20 font-medium" placeholder="What is not included in this quote..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
          </div>

          <div className="flex justify-start border-t border-border/60 pt-8 mt-12">
            <Button type="button" variant="outline" className="font-bold hover-elevate h-12 px-6 rounded-xl border-2 border-primary/30 text-primary hover:bg-primary/5 bg-background">
              <Sparkles className="w-5 h-5 mr-2 text-primary" />
              Re-generate with AI
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}