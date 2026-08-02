import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { HardHat } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
      <div className="w-24 h-24 bg-secondary/50 rounded-full flex items-center justify-center mb-6">
        <HardHat className="w-12 h-12 text-muted-foreground" />
      </div>
      <h1 className="text-4xl font-extrabold tracking-tight mb-2">404 Not Found</h1>
      <p className="text-muted-foreground text-lg mb-8 max-w-md">
        We couldn't find the page you're looking for. The job site might have moved.
      </p>
      <Link href="/">
        <Button size="lg" className="hover-elevate">
          Back to Site
        </Button>
      </Link>
    </div>
  );
}
