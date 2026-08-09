/**
 * Customer Communications settings card.
 * Rendered inside the Settings page as a standalone card component.
 */
import { useGetCompany, useUpdateCompany } from "@workspace/api-client-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import {
  MessageSquare, Mail, Smartphone, Save, Eye, X, CheckCircle2,
  Info,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";

const DEFAULT_MESSAGE =
  "We've received your enquiry and we'll be in touch as soon as possible to discuss your project. Our team typically responds within 1–2 business days.";

const commsSchema = z.object({
  enquiryConfirmationEnabled: z.boolean().default(true),
  enquiryEmailEnabled: z.boolean().default(true),
  enquirySmsEnabled: z.boolean().default(false),
  enquiryConfirmationMessage: z.string().optional().default(""),
  notificationsFromEmail: z.string().optional().default(""),
  proposalEmailEnabled: z.boolean().default(true),
});

type CommsValues = z.infer<typeof commsSchema>;

function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
  tag,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
  tag?: React.ReactNode;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-4 py-3", disabled && "opacity-50")}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-foreground">{label}</span>
          {tag}
        </div>
        {description && <p className="text-xs text-muted-foreground font-medium mt-0.5">{description}</p>}
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(!checked)}
        aria-checked={checked}
        role="switch"
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none",
          checked ? "bg-primary" : "bg-secondary",
          disabled && "cursor-not-allowed"
        )}
      >
        <span
          className={cn(
            "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200",
            checked ? "translate-x-5" : "translate-x-0"
          )}
        />
      </button>
    </div>
  );
}

export function CustomerCommsCard() {
  const { data: company, isLoading } = useGetCompany();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const initialized = useRef(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const updateCompany = useUpdateCompany({
    mutation: {
      onSuccess: (data) => {
        toast({ title: "Communications settings saved" });
        queryClient.setQueryData(["/api/company"], data);
      },
      onError: () => {
        toast({ title: "Failed to save settings", variant: "destructive" });
      },
    },
  });

  const form = useForm<CommsValues>({
    resolver: zodResolver(commsSchema),
    defaultValues: {
      enquiryConfirmationEnabled: true,
      enquiryEmailEnabled: true,
      enquirySmsEnabled: false,
      enquiryConfirmationMessage: "",
      notificationsFromEmail: "",
      proposalEmailEnabled: true,
    },
  });

  useEffect(() => {
    if (company && !initialized.current) {
      initialized.current = true;
      form.reset({
        enquiryConfirmationEnabled: (company as any).enquiryConfirmationEnabled ?? true,
        enquiryEmailEnabled: (company as any).enquiryEmailEnabled ?? true,
        enquirySmsEnabled: (company as any).enquirySmsEnabled ?? false,
        enquiryConfirmationMessage: (company as any).enquiryConfirmationMessage ?? "",
        notificationsFromEmail: (company as any).notificationsFromEmail ?? "",
        proposalEmailEnabled: (company as any).proposalEmailEnabled ?? true,
      });
    }
  }, [company, form]);

  function onSubmit(values: CommsValues) {
    updateCompany.mutate({ data: values as any });
  }

  const confirmEnabled = form.watch("enquiryConfirmationEnabled");
  const emailEnabled = form.watch("enquiryEmailEnabled");
  const smsEnabled = form.watch("enquirySmsEnabled");
  const confirmMessage = form.watch("enquiryConfirmationMessage") || DEFAULT_MESSAGE;
  const fromEmail = form.watch("notificationsFromEmail");
  const proposalEmailEnabled = form.watch("proposalEmailEnabled");
  const companyName = (company as any)?.name ?? "Your Business";

  if (isLoading) return null;

  return (
    <Card className="shadow-sm border-border/60 overflow-hidden rounded-2xl bg-card">
      <div className="px-8 py-5 border-b border-border/60 bg-secondary/30 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            <MessageSquare className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h2 className="text-base font-bold">Customer Communications</h2>
            <p className="text-xs text-muted-foreground font-medium">Automatic emails and messages sent to customers</p>
          </div>
        </div>
      </div>

      <CardContent className="p-8">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">


            {/* ── Enquiry Confirmation ── */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <CheckCircle2 className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Enquiry Confirmation</h3>
              </div>
              <p className="text-xs text-muted-foreground font-medium mb-4">
                Sent automatically when a customer submits an enquiry through your chat widget.
              </p>

              <div className="divide-y divide-border/40 border border-border/40 rounded-xl overflow-hidden">
                <div className="px-5">
                  <Toggle
                    checked={confirmEnabled}
                    onChange={(v) => form.setValue("enquiryConfirmationEnabled", v)}
                    label="Enquiry confirmation"
                    description="Send a confirmation to the customer when their enquiry is received"
                  />
                </div>
                <div className="px-5">
                  <Toggle
                    checked={emailEnabled}
                    onChange={(v) => form.setValue("enquiryEmailEnabled", v)}
                    label="Email"
                    description="Send an email confirmation to the customer"
                    disabled={!confirmEnabled}
                  />
                </div>
                <div className="px-5">
                  <Toggle
                    checked={smsEnabled}
                    onChange={(v) => form.setValue("enquirySmsEnabled", v)}
                    label="SMS"
                    description="Send an SMS confirmation (requires Twilio — coming soon)"
                    disabled={true}
                    tag={
                      <span className="text-[10px] font-bold bg-secondary text-muted-foreground px-2 py-0.5 rounded-full uppercase tracking-widest">
                        Coming soon
                      </span>
                    }
                  />
                </div>
              </div>
            </div>

            {/* ── Confirmation message ── */}
            <div>
              <div className="border-t border-border/40 mb-6" />
              <FormField
                control={form.control}
                name="enquiryConfirmationMessage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="field-label">Confirmation Message</FormLabel>
                    <p className="text-xs text-muted-foreground font-medium mb-2">
                      Personalise what you say to customers after they submit an enquiry. Your business name is always included.
                    </p>
                    <FormControl>
                      <Textarea
                        className="field-input resize-none min-h-[96px]"
                        placeholder={DEFAULT_MESSAGE}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                    <div className="flex gap-2 mt-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setPreviewOpen(true)}
                        className="font-bold rounded-xl h-8 text-xs border-border/60"
                      >
                        <Eye className="w-3.5 h-3.5 mr-1.5" /> Preview Customer Message
                      </Button>
                      {field.value && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => form.setValue("enquiryConfirmationMessage", "")}
                          className="font-bold rounded-xl h-8 text-xs border-border/60 text-muted-foreground"
                        >
                          <X className="w-3.5 h-3.5 mr-1.5" /> Reset to default
                        </Button>
                      )}
                    </div>
                  </FormItem>
                )}
              />
            </div>

            {/* ── Proposal emails ── */}
            <div>
              <div className="border-t border-border/40 mb-6" />
              <div className="flex items-center gap-2 mb-4">
                <Mail className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Proposal Emails</h3>
              </div>
              <p className="text-xs text-muted-foreground font-medium mb-4">
                Sent to the customer automatically when you click "Approve &amp; Send Proposal".
              </p>
              <div className="border border-border/40 rounded-xl overflow-hidden px-5">
                <Toggle
                  checked={proposalEmailEnabled}
                  onChange={(v) => form.setValue("proposalEmailEnabled", v)}
                  label="Send proposal email"
                  description="Automatically email the customer their proposal link when you approve and send"
                />
              </div>
            </div>

            {/* ── Sending address ── */}
            <div>
              <div className="border-t border-border/40 mb-6" />
              <FormField
                control={form.control}
                name="notificationsFromEmail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="field-label">Sending Email Address (From)</FormLabel>
                    <FormControl>
                      <Input
                        className="field-input"
                        type="email"
                        placeholder="noreply@yourdomain.com"
                        {...field}
                      />
                    </FormControl>
                    <div className="mt-2 flex items-start gap-2 bg-secondary/50 rounded-xl px-3 py-2.5">
                      <Info className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                      <p className="text-xs text-muted-foreground font-medium">
                        Must be a domain you have verified with Resend. Without a verified sending domain, emails will fail.{" "}
                        <a href="https://resend.com/domains" target="_blank" rel="noreferrer" className="underline text-primary">
                          Verify a domain →
                        </a>
                      </p>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Save */}
            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={updateCompany.isPending}
                className="font-bold h-11 px-6 rounded-xl shadow-md"
              >
                <Save className="w-4 h-4 mr-2" />
                {updateCompany.isPending ? "Saving…" : "Save Communications Settings"}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>

      {/* Preview dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-xl font-black">Preview Customer Message</DialogTitle>
            <DialogDescription>
              This is what the customer sees in their confirmation email.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Email subject</div>
            <p className="text-sm font-semibold bg-secondary/60 rounded-xl px-3 py-2">
              We've received your enquiry – {companyName}
            </p>
            <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest mt-3">Email body</div>
            <div className="bg-secondary/40 border border-border/40 rounded-xl p-4 space-y-2 text-sm text-foreground">
              <p>Hi <strong>[Customer First Name]</strong>,</p>
              <p>Thanks for getting in touch with <strong>{companyName}</strong>.</p>
              <div className="bg-secondary rounded-lg border-l-4 border-primary px-3 py-2 text-xs font-semibold text-muted-foreground">
                Your enquiry: <span className="text-foreground">[Project Type]</span>
              </div>
              <p className="text-sm">{confirmMessage}</p>
              <p>Thanks,<br /><strong>{companyName}</strong></p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
