import { useGetDashboard } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { Inbox, FileText, CheckCircle2, AlertCircle, TrendingUp, PoundSterling } from "lucide-react";

export default function Dashboard() {
  const { data: stats, isLoading, isError } = useGetDashboard();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (isError || !stats) {
    return <div className="text-destructive">Failed to load dashboard data.</div>;
  }

  const statCards = [
    { title: "New Enquiries", value: stats.newEnquiries, icon: Inbox, color: "text-blue-500" },
    { title: "Reviewing / Survey", value: stats.reviewing + stats.surveyRequired, icon: AlertCircle, color: "text-amber-500" },
    { title: "Quotes Sent", value: stats.quoteSent, icon: FileText, color: "text-purple-500" },
    { title: "Jobs Won", value: stats.won, icon: CheckCircle2, color: "text-green-500" },
  ];

  return (
    <div className="space-y-8 animate-in fade-in-0 duration-500">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-extrabold tracking-tight">Overview</h1>
        <p className="text-muted-foreground">Welcome back. Here's what's happening with your pipeline.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat, i) => (
          <Card key={i} className="shadow-sm border-border/50">
            <CardContent className="p-6">
              <div className="flex justify-between items-start">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">{stat.title}</p>
                  <p className="text-4xl font-bold tracking-tight">{stat.value}</p>
                </div>
                <div className={`p-3 bg-secondary rounded-lg ${stat.color}`}>
                  <stat.icon className="w-5 h-5" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold tracking-tight">Recent Enquiries</h2>
            <Link href="/enquiries" className="text-sm font-medium text-primary hover:underline">
              View all
            </Link>
          </div>
          
          {stats.recentEnquiries.length === 0 ? (
            <Card className="border-dashed bg-secondary/20">
              <CardContent className="flex flex-col items-center justify-center h-48 text-center">
                <Inbox className="w-10 h-10 text-muted-foreground mb-4 opacity-20" />
                <p className="text-lg font-medium text-foreground">No recent enquiries</p>
                <p className="text-sm text-muted-foreground">Your new leads will appear here.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {stats.recentEnquiries.map(enq => (
                <Link key={enq.id} href={`/enquiries/${enq.id}`}>
                  <Card className="hover-elevate cursor-pointer transition-all border-border/50">
                    <CardContent className="p-5 flex items-center justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-lg">{enq.customerName}</h3>
                          <StatusBadge status={enq.status} />
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {enq.projectType || "General"} • {enq.location || "No location"}
                        </p>
                      </div>
                      <div className="text-right text-sm text-muted-foreground hidden sm:block">
                        {formatDate(enq.createdAt)}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <h2 className="text-xl font-bold tracking-tight">Pipeline Value</h2>
          <Card className="bg-primary text-primary-foreground shadow-md border-transparent relative overflow-hidden">
            <div className="absolute top-0 right-0 -mt-4 -mr-4 w-32 h-32 bg-white/10 rounded-full blur-2xl" />
            <CardContent className="p-8 space-y-4">
              <div className="flex items-center gap-3 opacity-90">
                <TrendingUp className="w-5 h-5" />
                <h3 className="font-medium text-lg">Total Quoted</h3>
              </div>
              <p className="text-5xl font-extrabold tracking-tighter">
                {formatCurrency(stats.totalQuoteValue)}
              </p>
              <p className="text-sm opacity-80 pt-2 border-t border-primary-foreground/20">
                Across {stats.quoteSent} sent quotes
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string }> = {
    new_enquiry: { label: "New", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" },
    reviewing: { label: "Reviewing", color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" },
    survey_required: { label: "Survey Required", color: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400" },
    quote_sent: { label: "Quote Sent", color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400" },
    won: { label: "Won", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
    lost: { label: "Lost", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" },
  };

  const s = map[status] || { label: status, color: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300" };

  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${s.color}`}>
      {s.label}
    </span>
  );
}
