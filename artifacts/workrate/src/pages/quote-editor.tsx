import { useGetQuote, useUpdateQuote, useGetEnquiry, getGetQuoteQueryKey, getGetEnquiryQueryKey } from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { ArrowLeft, Save, Send, FileText } from "lucide-react";
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
  // The API uses enquiry ID for getQuote. The ID passed is enquiryId.
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

  if (isLoadingQuote) return <div className="p-8"><Skeleton className="h-[600px] w-full max-w-4xl mx-auto" /></div>;

  if (!quote) return <div className="p-8 text-center">Quote not found. <Link href={`/enquiries/${id}`} className="text-primary hover:underline">Back to enquiry</Link></div>;

  const materials = form.watch("materialsAllowance") || 0;
  const labour = form.watch("labourAllowance") || 0;
  const subtotal = Number(materials) + Number(labour);
  const vat = form.watch("vatAmount") || 0;
  const total = subtotal + Number(vat);

  function onSubmit(values: QuoteFormValues) {
    updateQuote.mutate({
      id: id,
      data: {
        ...values,
        estimatedTotal: subtotal,
        totalWithVat: total
      }
    });
  }

  return (
    <div className="max-w-4xl mx-auto pb-24 space-y-6">
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <Link href={`/enquiries/${id}`} className="hover:text-primary flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Back to Enquiry
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Edit Quote</h1>
          <p className="text-muted-foreground mt-1">For {enquiry?.customerName || "Customer"}</p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          <Card className="shadow-md">
            <CardHeader className="bg-secondary/30 border-b">
              <CardTitle className="text-xl flex items-center justify-between">
                <span className="flex items-center gap-2"><FileText className="w-5 h-5"/> Quote Document</span>
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem className="w-32 mb-0">
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-8 text-xs font-semibold">
                            <SelectValue placeholder="Status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="draft">DRAFT</SelectItem>
                          <SelectItem value="sent">SENT</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
              </CardTitle>
            </CardHeader>
            <CardContent className="p-8 space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="customerDetails"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Customer Details (To)</FormLabel>
                      <FormControl>
                        <Textarea rows={3} {...field} className="resize-none" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="projectDescription"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Project Description</FormLabel>
                    <FormControl>
                      <Textarea rows={4} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="border rounded-xl overflow-hidden">
                <div className="bg-secondary/50 p-4 font-semibold border-b text-sm text-muted-foreground">Pricing Breakdown</div>
                <div className="p-6 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end">
                    <FormField
                      control={form.control}
                      name="materialsAllowance"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Materials Allowance (£)</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.01" {...field} />
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
                          <FormLabel>Labour Allowance (£)</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.01" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="flex justify-end border-t pt-6">
                    <div className="w-64 space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Subtotal</span>
                        <span className="font-medium">{formatCurrency(subtotal)}</span>
                      </div>
                      <FormField
                        control={form.control}
                        name="vatAmount"
                        render={({ field }) => (
                          <FormItem className="flex items-center justify-between gap-4 space-y-0">
                            <FormLabel className="text-muted-foreground font-normal whitespace-nowrap">VAT (£)</FormLabel>
                            <FormControl>
                              <Input type="number" step="0.01" {...field} className="w-32 h-8 text-right" />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <div className="flex justify-between text-xl font-bold pt-3 border-t">
                        <span>Total</span>
                        <span className="text-primary">{formatCurrency(total)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Additional Notes</FormLabel>
                      <FormControl>
                        <Textarea rows={3} {...field} />
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
                      <FormLabel>Assumptions / Exclusions</FormLabel>
                      <FormControl>
                        <Textarea rows={3} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-4">
            <Button type="submit" size="lg" className="hover-elevate shadow-md px-8 h-12" disabled={updateQuote.isPending}>
              {updateQuote.isPending ? "Saving..." : <><Save className="w-4 h-4 mr-2"/> Save Quote</>}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
