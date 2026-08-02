import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Hammer, HardHat, FileText, Bot, ArrowRight, MessageSquare } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="flex flex-col min-h-[100dvh] bg-background">
      <header className="px-6 py-4 flex items-center justify-between border-b bg-card shadow-sm z-10 relative">
        <div className="flex items-center gap-2">
          <img src={import.meta.env.BASE_URL.replace(/\/$/, '') + '/logo.svg'} alt="WorkRate Logo" className="h-8 w-8" />
          <span className="font-bold text-xl tracking-tight text-foreground">WorkRate</span>
        </div>
        <div className="flex gap-4 items-center">
          <Link href="/sign-in">
            <Button variant="ghost" className="font-semibold hidden sm:inline-flex">Sign In</Button>
          </Link>
          <Link href="/sign-up">
            <Button className="font-semibold shadow-md hover-elevate">Get Started</Button>
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <section className="px-6 py-24 md:py-32 max-w-5xl mx-auto text-center">
          <Badge className="mb-6 px-3 py-1 bg-primary/10 text-primary border-primary/20 text-sm">
            Built for UK Trades
          </Badge>
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-foreground mb-8">
            AI-powered quoting & <br className="hidden md:block"/> enquiry management.
          </h1>
          <p className="text-xl text-muted-foreground mb-12 max-w-3xl mx-auto leading-relaxed">
            Stop losing weekends to paperwork. WorkRate captures customer enquiries, 
            generates AI job summaries, and drafts professional quotes automatically.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <Link href="/sign-up">
              <Button size="lg" className="w-full sm:w-auto text-lg h-14 px-8 shadow-lg hover-elevate">
                Start Free Trial <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
            </Link>
            <Link href="/chat">
              <Button size="lg" variant="outline" className="w-full sm:w-auto text-lg h-14 px-8 border-2 hover-elevate-2">
                <MessageSquare className="mr-2 w-5 h-5" />
                Try Customer Chat Demo
              </Button>
            </Link>
          </div>
        </section>

        <section className="bg-secondary/30 py-24 border-t">
          <div className="max-w-6xl mx-auto px-6">
            <div className="grid md:grid-cols-3 gap-12">
              <FeatureCard 
                icon={Bot}
                title="AI Customer Chat"
                description="Embed a smart widget on your site that captures job details and qualifies leads while you're on the tools."
              />
              <FeatureCard 
                icon={FileText}
                title="Instant Draft Quotes"
                description="Turn a conversational job description into a line-item estimate with materials and labour calculated."
              />
              <FeatureCard 
                icon={HardHat}
                title="Built for the Trade"
                description="Customizable settings for your trade—joinery, plumbing, electrical—with your own markup rates."
              />
            </div>
          </div>
        </section>
      </main>

      <footer className="py-12 border-t text-center text-muted-foreground bg-card">
        <p className="text-sm">&copy; {new Date().getFullYear()} WorkRate. All rights reserved.</p>
      </footer>
    </div>
  );
}

function Badge({ children, className }: { children: React.ReactNode, className?: string }) {
  return <span className={`inline-flex items-center rounded-full font-medium ${className}`}>{children}</span>;
}

function FeatureCard({ icon: Icon, title, description }: { icon: any, title: string, description: string }) {
  return (
    <div className="bg-card p-8 rounded-2xl border shadow-sm hover-elevate transition-all">
      <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mb-6 text-primary">
        <Icon className="w-6 h-6" />
      </div>
      <h3 className="text-xl font-bold mb-3">{title}</h3>
      <p className="text-muted-foreground leading-relaxed">{description}</p>
    </div>
  );
}
