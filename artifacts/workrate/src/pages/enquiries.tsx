import { useListEnquiries } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "wouter";
import { useState } from "react";
import { formatDate } from "@/lib/utils";
import { StatusBadge, getStatusColorBarClass } from "./dashboard";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, Hammer, Search, LayoutList, LayoutGrid } from "lucide-react";
import { Input } from "@/components/ui/input";

const STATUS_FILTERS = [
  { value: "all", label: "All" },
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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/50 pb-4">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            value={search} 
            onChange={e => setSearch(e.target.value)} 
            placeholder="Search jobs or customers..." 
            className="pl-9 h-10 bg-card border-border/60"
          />
        </div>
        
        <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 hide-scrollbar">
          {STATUS_FILTERS.map(filter => (
            <button
              key={filter.value}
              onClick={() => setStatusFilter(filter.value)}
              className={`px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-colors ${
                statusFilter === filter.value
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
              }`}
            >
              {filter.label}
            </button>
          ))}
          
          <div className="w-[1px] h-6 bg-border/60 mx-2 hidden sm:block" />
          
          <div className="hidden sm:flex bg-secondary p-1 rounded-md">
            <button className="p-1.5 bg-background shadow-sm rounded text-foreground">
              <LayoutList className="w-4 h-4" />
            </button>
            <button className="p-1.5 text-muted-foreground hover:text-foreground rounded transition-colors" title="Kanban view coming soon">
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-4">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))
        ) : filteredEnquiries?.length === 0 ? (
          <div className="text-center py-24 bg-card rounded-xl border border-dashed border-border/60 text-muted-foreground">
            <div className="w-16 h-16 bg-secondary/50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Search className="w-8 h-8 opacity-50" />
            </div>
            <p className="text-lg font-medium text-foreground">No jobs found</p>
            <p className="text-sm mt-1">Try adjusting your search or filters.</p>
          </div>
        ) : (
          filteredEnquiries?.map(enq => (
            <Link key={enq.id} href={`/enquiries/${enq.id}`}>
              <Card className="relative overflow-hidden group hover-elevate cursor-pointer border-border/60 transition-shadow bg-card">
                <div className={`absolute left-0 top-0 bottom-0 w-[3px] transition-colors group-hover:bg-primary ${getStatusColorBarClass(enq.status)}`} />
                <CardContent className="p-5 pl-7">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-3">
                    <h3 className="font-bold text-lg leading-none">{enq.customerName}</h3>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-sm text-muted-foreground font-medium">{formatDate(enq.createdAt)}</span>
                      <StatusBadge status={enq.status} />
                    </div>
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground mb-3 font-medium">
                    <div className="flex items-center gap-1.5">
                      <Hammer className="w-4 h-4 opacity-70" />
                      <span className="text-foreground/80">{enq.projectType || "General Enquiry"}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-4 h-4 opacity-70" />
                      <span className="text-foreground/80">{enq.location || "Location not provided"}</span>
                    </div>
                  </div>
                  
                  {enq.description && (
                    <p className="text-sm text-muted-foreground line-clamp-1 border-t border-border/40 pt-3">
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
