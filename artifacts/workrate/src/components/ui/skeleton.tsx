import * as React from "react"
import { Loader2 } from "lucide-react"

export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`animate-pulse rounded-md bg-muted ${className}`}
      {...props}
    />
  )
}

export function Spinner({ className, ...props }: React.SVGProps<SVGSVGElement>) {
  return <Loader2 className={`animate-spin ${className}`} {...props} />
}
