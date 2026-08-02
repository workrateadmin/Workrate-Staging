import { useGetEnquiry, useUpdateEnquiry, useGenerateEnquirySummary, useListEnquiryMessages, useGenerateQuote, useGetQuote, getGetQuoteQueryKey } from "@workspace/api-client-react";
import { useParams, Link, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "./dashboard";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, User, MapPin, Briefcase, Calendar, Phone, Mail, FileText, Wand2, Plus, ArrowRight } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatDate } from "@/lib/utils";

export default function EnquiryDetail() {
  const params = useParams();
  const id = Number(params.id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

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
    return <div className="space-y-4"><Skeleton className="h-8 w-64"/><Skeleton className="h-64 w-full"/></div>;
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-24">
      <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
        <Link href="/enquiries" className="hover:text-primary flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Back to Enquiries
        </Link>
      </div>

      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">{enquiry.customerName}</h1>
          <div className="flex items-center gap-3">
            <StatusBadge status={enquiry.status} />
            <span className="text-sm text-muted-foreground flex items-center gap-1">
              <Calendar className="w-4 h-4" /> {formatDate(enquiry.createdAt)}
            </span>
          </div>
        </div>
        
        <div className="w-full md:w-56">
          <Select 
            value={enquiry.status} 
            onValueChange={(val) => updateStatus.mutate({ id, data: { status: val } })}
            disabled={updateStatus.isPending}
          >
            <SelectTrigger className="bg-card">
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
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader className="bg-secondary/30 border-b pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <Wand2 className="w-5 h-5 text-primary" /> AI Job Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              {enquiry.aiSummary ? (
                <div className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground whitespace-pre-wrap">
                  {enquiry.aiSummary}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-muted-foreground mb-4">No AI summary generated yet.</p>
                  <Button 
                    onClick={() => generateSummary.mutate({ id })} 
                    disabled={generateSummary.isPending}
                    className="hover-elevate"
                  >
                    {generateSummary.isPending ? "Generating..." : "Generate AI Summary"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="bg-secondary/30 border-b pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileText className="w-5 h-5" /> Quote
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              {isLoadingQuote ? (
                <Skeleton className="h-12 w-full" />
              ) : quote ? (
                <div className="flex items-center justify-between p-4 border rounded-lg bg-secondary/10">
                  <div>
                    <p className="font-semibold">Draft Quote Created</p>
                    <p className="text-sm text-muted-foreground">Status: <span className="uppercase tracking-wider text-xs">{quote.status}</span></p>
                  </div>
                  <Link href={`/quotes/${id}`}>
                    <Button variant="outline" className="hover-elevate">View Quote <ArrowRight className="w-4 h-4 ml-2"/></Button>
                  </Link>
                </div>
              ) : (
                <div className="text-center py-6">
                  <p className="text-muted-foreground mb-4">You haven't quoted this job yet.</p>
                  <Button 
                    onClick={() => generateDraftQuote.mutate({ id })}
                    disabled={generateDraftQuote.isPending}
                    className="hover-elevate"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    {generateDraftQuote.isPending ? "Drafting..." : "Draft Quote with AI"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b pb-4">
              <CardTitle className="text-lg">Chat History</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-96 overflow-y-auto p-6 space-y-4 bg-secondary/5">
                {isLoadingMessages ? (
                  <div className="space-y-4"><Skeleton className="h-12 w-3/4"/><Skeleton className="h-12 w-3/4 ml-auto"/></div>
                ) : messages?.length === 0 ? (
                  <p className="text-center text-muted-foreground py-4">No chat messages found.</p>
                ) : (
                  messages?.map(msg => (
                    <div key={msg.id} className={`flex ${msg.role === 'customer' ? 'justify-start' : 'justify-end'}`}>
                      <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                        msg.role === 'customer' 
                          ? 'bg-card border border-border shadow-sm text-foreground' 
                          : 'bg-primary text-primary-foreground shadow-md'
                      }`}>
                        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="bg-secondary/30 border-b pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <User className="w-5 h-5" /> Customer Details
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Name</p>
                <p className="font-semibold">{enquiry.customerName}</p>
              </div>
              
              {enquiry.customerEmail && (
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground flex items-center gap-1.5"><Mail className="w-3.5 h-3.5"/> Email</p>
                  <p className="text-sm">
                    <a href={`mailto:${enquiry.customerEmail}`} className="text-primary hover:underline">{enquiry.customerEmail}</a>
                  </p>
                </div>
              )}
              
              {enquiry.customerPhone && (
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground flex items-center gap-1.5"><Phone className="w-3.5 h-3.5"/> Phone</p>
                  <p className="text-sm">{enquiry.customerPhone}</p>
                </div>
              )}

              {enquiry.location && (
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5"/> Location</p>
                  <p className="text-sm">{enquiry.location}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="bg-secondary/30 border-b pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <Briefcase className="w-5 h-5" /> Project Info
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Type</p>
                <p className="text-sm font-medium">{enquiry.projectType || "Not specified"}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Budget</p>
                <p className="text-sm font-medium">{enquiry.budget || "Not specified"}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Timescale</p>
                <p className="text-sm font-medium">{enquiry.timescale || "Not specified"}</p>
              </div>
              {enquiry.description && (
                <div className="space-y-1 pt-2 border-t">
                  <p className="text-sm font-medium text-muted-foreground mb-2">Original Description</p>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{enquiry.description}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
