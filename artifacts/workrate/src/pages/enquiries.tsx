import { useListEnquiries } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "wouter";
import { useState } from "react";
import { formatDate } from "@/lib/utils";
import { StatusBadge, getStatusColorBarClass } from "./dashboard";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, Hammer, Search, LayoutList, LayoutGrid, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";

const STATUS_FILTERS = [
  { value: "all", label: "All Jobs" },
  { value: "new_enquiry", label: "New" },
  { value: "reviewing", label: "Reviewing" },
  { value: "survey_required", label: "Survey" },
  { value: "quote_sent", label: "Quote Sent" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
];

export default function Enquiries() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  
  const { data: enquiries, isLoading } = useListEnquiries(
    statusFilter !== "all" ? { status: statusFilter } : undefined
  );

  const filteredEnquiries = enquiries?.filter(enq => 
    !search || 
    enq.customerName.toLowerCase().includes(search.toLowerCase()) ||
    enq.projectType?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-border/60 pb-4">
        <div className="relative w-full xl:w-96">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            value={search} 
            onChange={e => setSearch(e.target.value)} 
            placeholder="Search jobs, customers, or projects..." 
            className="pl-10 h-11 bg-card border-border/60 rounded-full font-medium shadow-sm focus-visible:ring-primary/30"
          />
        </div>
        
        <div className="flex items-center gap-2 overflow-x-auto pb-2 xl:pb-0 hide-scrollbar scroll-smooth">
          {STATUS_FILTERS.map(filter => (
            <button
              key={filter.value}
              onClick={() => setStatusFilter(filter.value)}
              className={`px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all ${
                statusFilter === filter.value
                  ? "bg-foreground text-background shadow-md"
                  : "bg-secondary/80 text-foreground/70 hover:bg-secondary hover:text-foreground border border-border/40"
              }`}
            >
              {filter.label}
            </button>
          ))}
          
          <div className="w-[1px] h-6 bg-border/60 mx-2 hidden sm:block" />
          
          <div className="hidden sm:flex bg-secondary/80 p-1 rounded-full border border-border/40">
            <button className="p-1.5 bg-background shadow-sm rounded-full text-foreground">
              <LayoutList className="w-4 h-4" />
            </button>
            <button className="p-1.5 text-muted-foreground hover:text-foreground rounded-full transition-colors" title="Kanban view coming soon">
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-3">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-2xl" />
          ))
        ) : filteredEnquiries?.length === 0 ? (
          <div className="text-center py-24 bg-secondary/30 rounded-2xl border border-dashed border-border/60 text-muted-foreground">
            <div className="w-16 h-16 bg-card rounded-full shadow-sm flex items-center justify-center mx-auto mb-4 border border-border/50">
              <AlertCircle className="w-8 h-8 opacity-50" />
            </div>
            <p className="text-xl font-bold text-foreground tracking-tight">No jobs found</p>
            <p className="text-sm mt-2 font-medium max-w-sm mx-auto">
              We couldn't find any jobs matching your current filters or search terms.
            </p>
          </div>
        ) : (
          filteredEnquiries?.map(enq => (
            <Link key={enq.id} href={`/enquiries/${enq.id}`}>
              <Card className="relative overflow-hidden group hover-elevate cursor-pointer border-border/60 transition-all bg-card rounded-xl shadow-sm hover:shadow-md">
                <div className={`absolute left-0 top-0 bottom-0 w-[4px] transition-colors ${getStatusColorBarClass(enq.status)}`} />
                <CardContent className="p-5 pl-7">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-3">
                    <h3 className="font-bold text-lg leading-tight text-foreground">{enq.customerName}</h3>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-sm text-muted-foreground font-semibold">{formatDate(enq.createdAt)}</span>
                      <StatusBadge status={enq.status} />
                    </div>
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground mb-4 font-semibold">
                    <div className="flex items-center gap-2">
                      <div className="p-1 bg-secondary rounded-md text-foreground/70"><Hammer className="w-3.5 h-3.5" /></div>
                      <span className="text-foreground">{enq.projectType || "General Enquiry"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="p-1 bg-secondary rounded-md text-foreground/70"><MapPin className="w-3.5 h-3.5" /></div>
                      <span className="text-foreground">{enq.location || "Location not provided"}</span>
                    </div>
                  </div>
                  
                  {enq.description && (
                    <p className="text-sm text-muted-foreground line-clamp-1 border-t border-border/40 pt-4 font-medium">
                      {enq.description}
                    </p>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}