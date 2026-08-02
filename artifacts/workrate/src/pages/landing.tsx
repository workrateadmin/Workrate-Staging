import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Hammer, HardHat, FileText, Bot, ArrowRight, MessageSquare, Star } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="flex flex-col min-h-[100dvh] bg-background">
      <header className="px-6 py-4 flex items-center justify-between border-b border-border/50 bg-background sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <div className="bg-primary text-primary-foreground p-1.5 rounded-md">
            <Hammer className="w-5 h-5" />
          </div>
          <span className="font-black text-xl tracking-tight text-foreground">WorkRate</span>
        </div>
        <div className="flex gap-4 items-center">
          <Link href="/sign-in">
            <Button variant="ghost" className="font-bold hidden sm:inline-flex">Sign In</Button>
          </Link>
          <Link href="/sign-up">
            <Button className="font-bold shadow-sm hover-elevate">Get Started</Button>
          </Link>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="px-6 pt-24 pb-20 md:pt-32 md:pb-28 max-w-5xl mx-auto text-center">
          <Badge className="mb-8 px-4 py-1.5 bg-primary/10 text-primary border border-primary/20 text-sm font-bold tracking-wide uppercase">
            Built for UK Trade Businesses
          </Badge>
          <h1 className="text-5xl md:text-[5.5rem] leading-[1.1] font-black tracking-tighter text-foreground mb-8">
            Win more jobs.<br />Quote faster.
          </h1>
          <p className="text-xl md:text-2xl text-muted-foreground mb-12 max-w-3xl mx-auto leading-relaxed font-medium">
            WorkRate handles the admin so you can focus on the work. AI-powered enquiries, instant smart quotes, and a clean pipeline.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <Link href="/sign-up">
              <Button size="lg" className="w-full sm:w-auto text-lg font-bold h-14 px-8 shadow-lg hover-elevate">
                Start Free Trial <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
            </Link>
            <Link href="/chat">
              <Button size="lg" variant="outline" className="w-full sm:w-auto text-lg font-bold h-14 px-8 border-2 hover-elevate bg-card">
                <MessageSquare className="mr-2 w-5 h-5" />
                Try the AI Chat
              </Button>
            </Link>
          </div>
        </section>

        {/* Social Proof */}
        <section className="border-y border-border/50 bg-secondary/30 py-10">
          <div className="max-w-5xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-8 opacity-70">
            {[
              { name: "Hartley Joinery", stars: 5 },
              { name: "TrueFlow Plumbing", stars: 5 },
              { name: "Apex Electrical", stars: 5 },
            ].map((company, i) => (
              <div key={i} className="flex items-center gap-3 grayscale-[0.5] hover:grayscale-0 transition-all cursor-default">
                <div className="flex gap-0.5 text-primary">
                  {Array.from({ length: company.stars }).map((_, j) => <Star key={j} className="w-4 h-4 fill-current" />)}
                </div>
                <span className="font-bold text-lg tracking-tight">{company.name}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Features */}
        <section className="py-24 md:py-32">
          <div className="max-w-6xl mx-auto px-6">
            <div className="grid md:grid-cols-3 gap-10">
              <FeatureCard 
                icon={Bot}
                title="AI Enquiries"
                description="Embed a smart widget on your site that captures job details and qualifies leads while you're on the tools."
              />
              <FeatureCard 
                icon={FileText}
                title="Smart Quotes"
                description="Turn a conversational job description into a line-item estimate with materials and labour calculated instantly."
              />
              <FeatureCard 
                icon={HardHat}
                title="Pipeline Dashboard"
                description="Keep track of every job from new enquiry to won project. Never lose track of a quote again."
              />
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section className="bg-sidebar py-24 md:py-32 text-sidebar-foreground border-y border-white/10">
          <div className="max-w-5xl mx-auto px-6">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-5xl font-black tracking-tight mb-4">How it works</h2>
              <p className="text-sidebar-foreground/70 text-lg max-w-2xl mx-auto">Three simple steps to streamline your quoting process.</p>
            </div>
            
            <div className="grid md:grid-cols-3 gap-8 relative">
              <div className="hidden md:block absolute top-1/2 left-0 w-full h-[2px] bg-white/10 -translate-y-1/2 z-0" />
              
              <StepCard number="1" title="Customer chats" desc="They describe the job to your AI assistant." />
              <StepCard number="2" title="You review leads" desc="See full summaries and AI-drafted quotes." />
              <StepCard number="3" title="Send quote" desc="Tweak the numbers and click send." />
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="bg-sidebar text-sidebar-foreground py-24 text-center">
          <div className="max-w-3xl mx-auto px-6">
            <h2 className="text-4xl md:text-5xl font-black tracking-tight mb-8">Ready to win more business?</h2>
            <Link href="/sign-up">
              <Button size="lg" className="text-lg font-bold h-14 px-10 shadow-lg hover-elevate">
                Sign Up Now <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
            </Link>
          </div>
        </section>
      </main>

      <footer className="py-8 border-t border-border/50 text-center text-muted-foreground font-medium bg-card">
        <p className="text-sm">&copy; {new Date().getFullYear()} WorkRate. All rights reserved.</p>
      </footer>
    </div>
  );
}

function Badge({ children, className }: { children: React.ReactNode, className?: string }) {
  return <span className={`inline-flex items-center rounded-full ${className}`}>{children}</span>;
}

function FeatureCard({ icon: Icon, title, description }: { icon: any, title: string, description: string }) {
  return (
    <div className="bg-card p-8 rounded-2xl border border-border/60 shadow-sm hover-elevate transition-all group">
      <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mb-6 text-primary group-hover:scale-110 transition-transform">
        <Icon className="w-6 h-6" />
      </div>
      <h3 className="text-xl font-black mb-3 tracking-tight">{title}</h3>
      <p className="text-muted-foreground leading-relaxed font-medium">{description}</p>
    </div>
  );
}

function StepCard({ number, title, desc }: { number: string, title: string, desc: string }) {
  return (
    <div className="relative z-10 flex flex-col items-center text-center bg-sidebar md:bg-transparent p-6 md:p-0 rounded-xl">
      <div className="w-16 h-16 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-2xl font-black shadow-lg mb-6 border-4 border-sidebar">
        {number}
      </div>
      <h3 className="text-xl font-bold mb-2">{title}</h3>
      <p className="text-sidebar-foreground/70 font-medium">{desc}</p>
    </div>
  );
}
