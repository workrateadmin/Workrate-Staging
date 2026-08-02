import { useGetDashboard } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { Inbox, TrendingUp, ChevronRight, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Dashboard() {
  const { data: stats, isLoading, isError } = useGetDashboard();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (isError || !stats) {
    return <div className="text-destructive font-medium p-4 border border-destructive/20 bg-destructive/10 rounded-xl">Failed to load dashboard data.</div>;
  }

  const inProgress = stats.reviewing + stats.surveyRequired;

  const statCards = [
    { title: "New Enquiries", value: stats.newEnquiries, borderColor: "border-l-blue-500" },
    { title: "In Progress", value: inProgress, borderColor: "border-l-amber-500" },
    { title: "Quotes Sent", value: stats.quoteSent, borderColor: "border-l-violet-500" },
    { title: "Jobs Won", value: stats.won, borderColor: "border-l-emerald-500" },
  ];

  const totalPipelineEnquiries = stats.newEnquiries + inProgress + stats.quoteSent;
  const breakDown = [
    { label: "New", value: stats.newEnquiries, color: "bg-blue-500", percent: totalPipelineEnquiries ? (stats.newEnquiries / totalPipelineEnquiries) * 100 : 0 },
    { label: "Review", value: inProgress, color: "bg-amber-500", percent: totalPipelineEnquiries ? (inProgress / totalPipelineEnquiries) * 100 : 0 },
    { label: "Quoted", value: stats.quoteSent, color: "bg-violet-500", percent: totalPipelineEnquiries ? (stats.quoteSent / totalPipelineEnquiries) * 100 : 0 },
  ];

  return (
    <div className="space-y-8 animate-in fade-in-0 duration-500">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat, i) => (
          <Card key={i} className={`shadow-sm border-y border-r border-border/50 border-l-[3px] ${stat.borderColor}`}>
            <CardContent className="p-6">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{stat.title}</p>
                <p className="text-4xl font-black tracking-tight">{stat.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-border/40">
            <h2 className="text-xl font-bold tracking-tight">Recent Jobs</h2>
            <Link href="/enquiries" className="text-sm font-semibold text-primary hover:text-primary/80 transition-colors flex items-center gap-1">
              View pipeline <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
          
          {stats.recentEnquiries.length === 0 ? (
            <Card className="border-dashed bg-secondary/20 border-border/60">
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-16 h-16 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mb-4">
                  <Inbox className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-bold mb-2">No jobs yet</h3>
                <p className="text-muted-foreground mb-6 max-w-sm">
                  Post your chat link to start getting enquiries.
                </p>
                <Link href="/chat">
                  <Button className="font-semibold shadow-sm hover-elevate">
                    <MessageSquare className="w-4 h-4 mr-2" /> Open Chat Widget
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {stats.recentEnquiries.map(enq => (
                <Link key={enq.id} href={`/enquiries/${enq.id}`}>
                  <Card className={`relative overflow-hidden group hover-elevate cursor-pointer transition-all border-border/50`}>
                    <div className={`absolute left-0 top-0 bottom-0 w-[3px] transition-colors group-hover:bg-primary ${getStatusColorBarClass(enq.status)}`} />
                    <CardContent className="p-4 pl-6 flex items-center justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-lg">{enq.customerName}</h3>
                        </div>
                        <p className="text-sm font-medium">
                          {enq.projectType || "General Enquiry"}
                          <span className="text-muted-foreground font-normal ml-2">
                            {enq.location ? `• ${enq.location}` : ""} • {formatDate(enq.createdAt)}
                          </span>
                        </p>
                      </div>
                      <div className="hidden sm:block">
                        <StatusBadge status={enq.status} />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          <Card className="shadow-sm border-border/50">
            <CardContent className="p-6 space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Pipeline Value
              </div>
              <div className="flex items-center gap-3">
                <p className="text-3xl font-black tracking-tight">{formatCurrency(stats.totalQuoteValue)}</p>
                {stats.totalQuoteValue > 0 && <TrendingUp className="w-6 h-6 text-emerald-500" />}
              </div>
              <p className="text-sm text-muted-foreground pt-1">
                Total estimated across all open quotes.
              </p>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-border/50">
            <CardContent className="p-6">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Pipeline Breakdown</h3>
              {totalPipelineEnquiries === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-4 bg-secondary/30 rounded-lg border border-dashed">
                  No active pipeline data
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Stacked Bar */}
                  <div className="h-3 w-full bg-secondary rounded-full overflow-hidden flex">
                    {breakDown.map((item, i) => (
                      item.value > 0 && (
                        <div key={i} className={`h-full ${item.color}`} style={{ width: `${item.percent}%` }} />
                      )
                    ))}
                  </div>
                  {/* Legend */}
                  <div className="space-y-2">
                    {breakDown.map((item, i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <div className={`w-3 h-3 rounded-sm ${item.color}`} />
                          <span className="font-medium">{item.label}</span>
                        </div>
                        <span className="text-muted-foreground font-semibold">{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export function getStatusColorBarClass(status: string) {
  switch (status) {
    case 'new_enquiry': return 'bg-blue-500';
    case 'reviewing':
    case 'survey_required': return 'bg-amber-500';
    case 'quote_sent': return 'bg-violet-500';
    case 'won': return 'bg-emerald-500';
    case 'lost': return 'bg-red-500';
    default: return 'bg-gray-300';
  }
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string }> = {
    new_enquiry: { label: "New", color: "bg-blue-100 text-blue-800 border-blue-200" },
    reviewing: { label: "Reviewing", color: "bg-amber-100 text-amber-800 border-amber-200" },
    survey_required: { label: "Survey Required", color: "bg-amber-100 text-amber-800 border-amber-200" },
    quote_sent: { label: "Quote Sent", color: "bg-violet-100 text-violet-800 border-violet-200" },
    won: { label: "Won", color: "bg-emerald-100 text-emerald-800 border-emerald-200" },
    lost: { label: "Lost", color: "bg-red-100 text-red-800 border-red-200" },
  };

  const s = map[status] || { label: status, color: "bg-gray-100 text-gray-800 border-gray-200" };

  return (
    <span className={`px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider border ${s.color}`}>
      {s.label}
    </span>
  );
}
