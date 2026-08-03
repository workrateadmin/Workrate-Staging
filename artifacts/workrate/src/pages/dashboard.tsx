import { useGetDashboard } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { Inbox, TrendingUp, ChevronRight, MessageSquare, Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Dashboard() {
  const { data: stats, isLoading, isError } = useGetDashboard();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28 w-full rounded-2xl" />)}
        </div>
      </div>
    );
  }

  if (isError || !stats) {
    return <div className="text-destructive font-medium p-4 border border-destructive/20 bg-destructive/10 rounded-xl">Failed to load dashboard data.</div>;
  }

  const inProgress = stats.reviewing + stats.surveyRequired;

  const statCards = [
    { title: "New Leads", value: stats.newEnquiries, color: "text-blue-600", bg: "bg-blue-600/10" },
    { title: "In Progress", value: inProgress, color: "text-amber-600", bg: "bg-amber-600/10" },
    { title: "Quoted", value: stats.quoteSent, color: "text-violet-600", bg: "bg-violet-600/10" },
    { title: "Won Jobs", value: stats.won, color: "text-emerald-600", bg: "bg-emerald-600/10" },
  ];

  const totalPipelineEnquiries = stats.newEnquiries + inProgress + stats.quoteSent;
  const breakDown = [
    { label: "New", value: stats.newEnquiries, color: "bg-blue-500", percent: totalPipelineEnquiries ? (stats.newEnquiries / totalPipelineEnquiries) * 100 : 0 },
    { label: "Reviewing", value: inProgress, color: "bg-amber-500", percent: totalPipelineEnquiries ? (inProgress / totalPipelineEnquiries) * 100 : 0 },
    { label: "Quoted", value: stats.quoteSent, color: "bg-violet-500", percent: totalPipelineEnquiries ? (stats.quoteSent / totalPipelineEnquiries) * 100 : 0 },
  ];

  return (
    <div className="space-y-8 animate-in fade-in-0 duration-500">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat, i) => (
          <Card key={i} className="shadow-sm border-border/60 hover-elevate transition-all overflow-hidden rounded-2xl">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">{stat.title}</p>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${stat.bg} ${stat.color}`}>
                  <Briefcase className="w-4 h-4" />
                </div>
              </div>
              <p className="text-4xl font-black tracking-tight text-foreground">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-border/60">
            <h2 className="text-xl font-bold tracking-tight">Recent Jobs</h2>
            <Link href="/enquiries" className="text-sm font-semibold text-primary hover:text-primary/80 transition-colors flex items-center gap-1">
              View all <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
          
          {stats.recentEnquiries.length === 0 ? (
            <Card className="border-dashed bg-secondary/50 border-border/60 rounded-2xl">
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-16 h-16 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-4">
                  <Inbox className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-bold mb-2">Your pipeline is empty</h3>
                <p className="text-muted-foreground mb-6 max-w-sm font-medium">
                  Share your WorkRate chat link to start capturing leads instantly.
                </p>
                <Link href="/chat">
                  <Button className="font-semibold shadow-sm hover-elevate rounded-full px-6">
                    <MessageSquare className="w-4 h-4 mr-2" /> View Chat Widget
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {stats.recentEnquiries.map(enq => (
                <Link key={enq.id} href={`/enquiries/${enq.id}`}>
                  <Card className="relative overflow-hidden group hover-elevate cursor-pointer transition-all border-border/60 bg-card rounded-xl shadow-sm hover:shadow-md">
                    <div className={`absolute left-0 top-0 bottom-0 w-[4px] transition-colors ${getStatusColorBarClass(enq.status)}`} />
                    <CardContent className="p-4 pl-6 flex items-center justify-between">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-lg leading-none">{enq.customerName}</h3>
                        </div>
                        <p className="text-sm font-medium text-foreground/80">
                          {enq.projectType || "General Enquiry"}
                          <span className="text-muted-foreground ml-2 inline-block">
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
          <Card className="shadow-sm border-border/60 rounded-2xl bg-primary text-primary-foreground overflow-hidden relative">
            {/* Background decoration */}
            <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none transform translate-x-4 -translate-y-4">
              <TrendingUp className="w-32 h-32" />
            </div>
            
            <CardContent className="p-6 space-y-3 relative z-10">
              <div className="flex items-center gap-2 text-sm font-bold text-primary-foreground/80 uppercase tracking-widest">
                Pipeline Value
              </div>
              <div className="flex items-center gap-3">
                <p className="text-4xl font-black tracking-tight">{formatCurrency(stats.totalQuoteValue)}</p>
              </div>
              <p className="text-sm text-primary-foreground/80 font-medium">
                Total estimated across all open quotes.
              </p>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-border/60 rounded-2xl">
            <CardContent className="p-6">
              <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest mb-5">Pipeline Breakdown</h3>
              {totalPipelineEnquiries === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-6 bg-secondary/50 rounded-xl border border-dashed font-medium">
                  No active pipeline data
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Stacked Bar */}
                  <div className="h-4 w-full bg-secondary rounded-full overflow-hidden flex shadow-inner">
                    {breakDown.map((item, i) => (
                      item.value > 0 && (
                        <div key={i} className={`h-full ${item.color} transition-all duration-1000 ease-out`} style={{ width: `${item.percent}%` }} />
                      )
                    ))}
                  </div>
                  {/* Legend */}
                  <div className="space-y-3">
                    {breakDown.map((item, i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-3">
                          <div className={`w-3.5 h-3.5 rounded-sm ${item.color} shadow-sm`} />
                          <span className="font-semibold text-foreground">{item.label}</span>
                        </div>
                        <span className="text-muted-foreground font-bold">{item.value}</span>
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
    new_enquiry: { label: "New", color: "bg-blue-50 text-blue-700 border-blue-200" },
    reviewing: { label: "Reviewing", color: "bg-amber-50 text-amber-700 border-amber-200" },
    survey_required: { label: "Survey Required", color: "bg-amber-50 text-amber-700 border-amber-200" },
    quote_sent: { label: "Quote Sent", color: "bg-violet-50 text-violet-700 border-violet-200" },
    won: { label: "Won", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    lost: { label: "Lost", color: "bg-red-50 text-red-700 border-red-200" },
  };

  const s = map[status] || { label: status, color: "bg-gray-50 text-gray-700 border-gray-200" };

  return (
    <span className={`px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider border shadow-sm ${s.color}`}>
      {s.label}
    </span>
  );
}