import { Link } from "wouter";
import { Fragment } from "react";
import { ChevronLeft } from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@workspace/memphis-bold/components/ui/breadcrumb";
import { cn } from "@workspace/memphis-bold/lib/utils";

export interface BreadcrumbItemDef {
  label: string;
  href?: string;
}

interface SettingsBreadcrumbProps {
  items: BreadcrumbItemDef[];
  className?: string;
}

export function SettingsBreadcrumb({ items, className }: SettingsBreadcrumbProps) {
  return (
    <Breadcrumb className={cn("mb-8", className)}>
      <BreadcrumbList>
        {items.map((item, idx) => {
          const isLast = idx === items.length - 1;
          return (
            <Fragment key={`${item.label}-${idx}`}>
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage>{item.label}</BreadcrumbPage>
                ) : item.href ? (
                  <BreadcrumbLink asChild>
                    <Link href={item.href}>{item.label}</Link>
                  </BreadcrumbLink>
                ) : (
                  <span className="text-muted-foreground">{item.label}</span>
                )}
              </BreadcrumbItem>
              {!isLast && <BreadcrumbSeparator />}
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

interface BackLinkProps {
  href: string;
  label: string;
  className?: string;
}

export function BackLink({ href, label, className }: BackLinkProps) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors mb-6",
        className
      )}
    >
      <ChevronLeft className="w-4 h-4" />
      {label}
    </Link>
  );
}
