import { useListEnquiries } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "wouter";
import { useState } from "react";
import { formatDate } from "@/lib/utils";
import { StatusBadge } from "./dashboard";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, Briefcase, Calendar, ChevronRight } from "lucide-react";

export default function Enquiries() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  
  const { data: enquiries, isLoading } = useListEnquiries(
    statusFilter !== "all" ? { status: statusFilter } : undefined
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Enquiries</h1>
          <p className="text-muted-foreground mt-1">Manage your customer pipeline.</p>
        </div>
        
        <div className="w-full sm:w-64">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full shadow-sm">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Enquiries</SelectItem>
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

      <div className="grid gap-3">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))
        ) : enquiries?.length === 0 ? (
          <div className="text-center py-16 bg-card rounded-xl border border-dashed text-muted-foreground">
            No enquiries found for this filter.
          </div>
        ) : (
          enquiries?.map(enq => (
            <Link key={enq.id} href={`/enquiries/${enq.id}`}>
              <Card className="hover-elevate cursor-pointer border-border/60 transition-shadow">
                <CardContent className="p-0">
                  <div className="flex flex-col sm:flex-row sm:items-center p-5 gap-4">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-3">
                        <h3 className="font-bold text-lg">{enq.customerName}</h3>
                        <StatusBadge status={enq.status} />
                      </div>
                      
                      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <Briefcase className="w-4 h-4 opacity-70" />
                          <span>{enq.projectType || "General Enquiry"}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-4 h-4 opacity-70" />
                          <span>{enq.location || "Location not provided"}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-4 h-4 opacity-70" />
                          <span>{formatDate(enq.createdAt)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="hidden sm:flex text-muted-foreground">
                      <ChevronRight className="w-5 h-5 opacity-50" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
