import { useGetEnquiry, useUpdateEnquiry, useGenerateEnquirySummary, useListEnquiryMessages, useGenerateQuote, useGetQuote, getGetQuoteQueryKey } from "@workspace/api-client-react";
import { useParams, Link, useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "./dashboard";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, User, MapPin, Hammer, Calendar, Phone, Mail, FileText, Sparkles, Plus, Clock, PoundSterling, MessageSquare, ChevronDown } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatDate, formatCurrency } from "@/lib/utils";
import { useState } from "react";

export default function EnquiryDetail() {
  const params = useParams();
  const id = Number(params.id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [chatOpen, setChatOpen] = useState(false);
  const [statusVal, setStatusVal] = useState<string | undefined>();

  const { data: enquiry, isLoading: isLoadingEnquiry } = useGetEnquiry(id);
  const { data: messages, isLoading: isLoadingMessages } = useListEnquiryMessages(id);
  const { data: quote, isLoading: isLoadingQuote } = useGetQuote(id, { query: { retry: false, queryKey: getGetQuoteQueryKey(id) } });

  const updateStatus = useUpdateEnquiry({
    mutation: {
      onSuccess: () => {
        toast({ title: "Status updated" });
        queryClient.invalidateQueries({ queryKey: ["/api/enquiries"] });
        queryClient.invalidateQueries({ queryKey: [`/api/enquiries/${id}`] });
      }
    }
  });

  const generateSummary = useGenerateEnquirySummary({
    mutation: {
      onSuccess: () => {
        toast({ title: "AI Summary generated" });
        queryClient.invalidateQueries({ queryKey: [`/api/enquiries/${id}`] });
      },
      onError: () => {
        toast({ title: "Failed to generate summary", variant: "destructive" });
      }
    }
  });

  const generateDraftQuote = useGenerateQuote({
    mutation: {
      onSuccess: (newQuote) => {
        toast({ title: "Draft Quote generated" });
        setLocation(`/quotes/${id}`);
      },
      onError: () => {
        toast({ title: "Failed to generate quote", variant: "destructive" });
      }
    }
  });

  if (isLoadingEnquiry || !enquiry) {
    return <div className="space-y-4 max-w-6xl mx-auto"><Skeleton className="h-8 w-64"/><Skeleton className="h-64 w-full"/></div>;
  }

  const handleSaveStatus = () => {
    if (statusVal && statusVal !== enquiry.status) {
      updateStatus.mutate({ id, data: { status: statusVal } });
    }
  };

  const currentStatusVal = statusVal || enquiry.status;

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-24 animate-in fade-in-0 duration-500">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-6">
        <Link href="/enquiries" className="hover:text-primary flex items-center gap-1 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Pipeline
        </Link>
        <span>/</span>
        <span className="text-foreground">{enquiry.customerName}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2/3) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Job Overview Card */}
          <Card className="shadow-sm border-border/50 overflow-hidden">
            <div className="bg-secondary/30 px-6 py-6 border-b border-border/40">
              <h1 className="text-2xl font-black tracking-tight mb-2">{enquiry.customerName}</h1>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-medium text-muted-foreground">
                <span className="flex items-center gap-1.5"><Hammer className="w-4 h-4"/> {enquiry.projectType || "General"}</span>
                <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4"/> {enquiry.location || "No location"}</span>
                <span className="flex items-center gap-1.5"><Calendar className="w-4 h-4"/> {formatDate(enquiry.createdAt)}</span>
              </div>
            </div>
            <CardContent className="p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                <InfoBox icon={Mail} label="Email" value={enquiry.customerEmail} isLink />
                <InfoBox icon={Phone} label="Phone" value={enquiry.customerPhone} />
                <InfoBox icon={PoundSterling} label="Budget" value={enquiry.budget} />
                <InfoBox icon={Clock} label="Timescale" value={enquiry.timescale} />
              </div>
              {enquiry.description && (
                <div className="pt-6 border-t border-border/40">
                  <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3">Job Description</h3>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{enquiry.description}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* AI Summary Card */}
          <Card className="shadow-sm border-border/50">
            <div className="px-6 py-4 border-b border-border/40 flex items-center justify-between">
              <h2 className="text-base font-bold flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" /> AI Job Summary
              </h2>
              {enquiry.aiSummary && (
                <button 
                  onClick={() => generateSummary.mutate({ id })}
                  disabled={generateSummary.isPending}
                  className="text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
                >
                  Regenerate
                </button>
              )}
            </div>
            <CardContent className="p-6">
              {enquiry.aiSummary ? (
                <div className="bg-primary/5 border border-primary/10 rounded-xl p-5">
                  <div className="prose prose-sm dark:prose-invert max-w-none text-foreground leading-relaxed whitespace-pre-wrap font-medium">
                    {enquiry.aiSummary}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="w-12 h-12 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto mb-4">
                    <Sparkles className="w-6 h-6" />
                  </div>
                  <h3 className="font-bold mb-2">No summary yet</h3>
                  <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
                    Let AI extract the key details, materials needed, and constraints from the customer's description and chat history.
                  </p>
                  <Button 
                    onClick={() => generateSummary.mutate({ id })} 
                    disabled={generateSummary.isPending}
                    className="w-full max-w-xs hover-elevate font-semibold"
                  >
                    {generateSummary.isPending ? "Generating..." : "Generate AI Summary"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Chat History Card */}
          <Card className="shadow-sm border-border/50">
            <div 
              className="px-6 py-4 flex items-center justify-between cursor-pointer hover:bg-secondary/20 transition-colors"
              onClick={() => setChatOpen(!chatOpen)}
            >
              <h2 className="text-base font-bold flex items-center gap-2">
                <MessageSquare className="w-5 h-5" /> Chat History
              </h2>
              <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform ${chatOpen ? "rotate-180" : ""}`} />
            </div>
            {chatOpen && (
              <CardContent className="p-0 border-t border-border/40">
                <div className="max-h-[500px] overflow-y-auto p-6 space-y-6 bg-secondary/10">
                  {isLoadingMessages ? (
                    <div className="space-y-4"><Skeleton className="h-16 w-3/4"/><Skeleton className="h-16 w-3/4 ml-auto"/></div>
                  ) : messages?.length === 0 ? (
                    <p className="text-center text-sm font-medium text-muted-foreground py-8">No chat messages found.</p>
                  ) : (
                    messages?.map(msg => (
                      <div key={msg.id} className={`flex ${msg.role === 'customer' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] rounded-2xl px-5 py-4 ${
                          msg.role === 'customer' 
                            ? 'bg-card border border-border shadow-sm text-foreground rounded-tr-sm' 
                            : 'bg-primary text-primary-foreground shadow-md rounded-tl-sm'
                        }`}>
                          <p className="text-sm font-medium whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                          <p className={`text-[10px] mt-2 font-semibold ${msg.role === 'customer' ? 'text-muted-foreground' : 'text-primary-foreground/70'}`}>
                            {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            )}
          </Card>
        </div>

        {/* Right Column (1/3) */}
        <div className="space-y-6">
          {/* Status Card */}
          <Card className="shadow-sm border-border/50">
            <div className="px-6 py-4 border-b border-border/40">
              <h2 className="text-base font-bold">Status</h2>
            </div>
            <CardContent className="p-6 space-y-4 text-center">
              <div className="flex justify-center mb-2">
                <StatusBadge status={currentStatusVal} />
              </div>
              <Select 
                value={currentStatusVal} 
                onValueChange={setStatusVal}
                disabled={updateStatus.isPending}
              >
                <SelectTrigger className="bg-card font-semibold">
                  <SelectValue placeholder="Update Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new_enquiry">New</SelectItem>
                  <SelectItem value="reviewing">Reviewing</SelectItem>
                  <SelectItem value="survey_required">Survey Required</SelectItem>
                  <SelectItem value="quote_sent">Quote Sent</SelectItem>
                  <SelectItem value="won">Won</SelectItem>
                  <SelectItem value="lost">Lost</SelectItem>
                </SelectContent>
              </Select>
              {statusVal && statusVal !== enquiry.status && (
                <Button 
                  onClick={handleSaveStatus} 
                  className="w-full font-semibold hover-elevate"
                  disabled={updateStatus.isPending}
                >
                  Save Status
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Quote Card */}
          <Card className="shadow-sm border-border/50">
            <div className="px-6 py-4 border-b border-border/40">
              <h2 className="text-base font-bold flex items-center gap-2">
                <FileText className="w-5 h-5" /> Quote
              </h2>
            </div>
            <CardContent className="p-6">
              {isLoadingQuote ? (
                <Skeleton className="h-24 w-full" />
              ) : quote ? (
                <div className="space-y-4">
                  <div className="text-center p-4 bg-secondary/30 rounded-xl border border-border/60">
                    <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-1">Estimated Total</p>
                    <p className="text-3xl font-black">{formatCurrency(quote.totalWithVat || 0)}</p>
                    <div className="flex items-center justify-center gap-3 mt-3 text-sm font-medium text-muted-foreground">
                      <span>Materials: {formatCurrency(quote.materialsAllowance || 0)}</span>
                      <span className="w-1 h-1 rounded-full bg-border" />
                      <span>Labour: {formatCurrency(quote.labourAllowance || 0)}</span>
                    </div>
                  </div>
                  <Link href={`/quotes/${id}`}>
                    <Button className="w-full font-semibold hover-elevate">View / Edit Quote</Button>
                  </Link>
                </div>
              ) : (
                <div className="text-center py-4">
                  <p className="font-bold mb-2">No quote yet</p>
                  <p className="text-sm text-muted-foreground mb-6">Generate an itemised quote based on the job details.</p>
                  <Button 
                    onClick={() => generateDraftQuote.mutate({ id })}
                    disabled={generateDraftQuote.isPending}
                    className="w-full font-semibold hover-elevate"
                    variant="outline"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    {generateDraftQuote.isPending ? "Drafting..." : "Draft Quote with AI"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function InfoBox({ icon: Icon, label, value, isLink = false }: { icon: any, label: string, value?: string | null, isLink?: boolean }) {
  if (!value) return null;
  return (
    <div className="bg-secondary/30 border border-border/40 rounded-lg p-3 flex flex-col gap-1">
      <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5" /> {label}
      </span>
      {isLink ? (
        <a href={label === 'Email' ? `mailto:${value}` : `tel:${value}`} className="text-sm font-semibold text-primary hover:underline truncate">
          {value}
        </a>
      ) : (
        <span className="text-sm font-semibold text-foreground truncate">{value}</span>
      )}
    </div>
  );
}
