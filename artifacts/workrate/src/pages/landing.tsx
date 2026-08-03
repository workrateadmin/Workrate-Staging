import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Hammer, HardHat, FileText, Bot, ArrowRight, MessageSquare, Star, CheckCircle2 } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="flex flex-col min-h-[100dvh] bg-background">
      <header className="px-8 py-5 flex items-center justify-between border-b border-border/60 bg-background/80 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="bg-primary text-primary-foreground p-2 rounded-lg shadow-sm">
            <Hammer className="w-6 h-6" />
          </div>
          <span className="font-black text-2xl tracking-tight text-foreground">WorkRate</span>
        </div>
        <div className="flex gap-5 items-center">
          <Link href="/sign-in">
            <Button variant="ghost" className="font-bold hidden sm:inline-flex text-md hover:bg-secondary rounded-full px-6">Sign In</Button>
          </Link>
          <Link href="/sign-up">
            <Button className="font-bold shadow-md hover-elevate rounded-full px-8 text-md h-11">Get Started</Button>
          </Link>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="px-6 pt-28 pb-24 md:pt-40 md:pb-32 max-w-6xl mx-auto text-center relative">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/5 rounded-full blur-3xl -z-10" />
          
          <Badge className="mb-10 px-5 py-2 bg-secondary/80 text-foreground border border-border/60 text-sm font-bold tracking-widest uppercase shadow-sm">
            Built for UK Trade Businesses
          </Badge>
          <h1 className="text-6xl md:text-[6.5rem] leading-[1.05] font-black tracking-tighter text-foreground mb-10">
            Win more jobs.<br />
            <span className="text-primary">Quote faster.</span>
          </h1>
          <p className="text-xl md:text-2xl text-muted-foreground mb-14 max-w-3xl mx-auto leading-relaxed font-semibold">
            WorkRate handles the admin so you can focus on the work. AI-powered enquiries, instant smart quotes, and a clean, premium pipeline.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-5">
            <Link href="/sign-up">
              <Button size="lg" className="w-full sm:w-auto text-lg font-black h-16 px-10 shadow-xl hover-elevate rounded-2xl">
                Start Free Trial <ArrowRight className="ml-3 w-6 h-6" />
              </Button>
            </Link>
            <Link href="/chat">
              <Button size="lg" variant="outline" className="w-full sm:w-auto text-lg font-black h-16 px-10 border-2 border-border/80 hover:bg-secondary hover-elevate bg-card rounded-2xl">
                <MessageSquare className="mr-3 w-6 h-6" />
                Try the AI Chat
              </Button>
            </Link>
          </div>
          <div className="mt-10 flex items-center justify-center gap-6 text-sm font-bold text-muted-foreground">
             <span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> No credit card required</span>
             <span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> 14-day free trial</span>
          </div>
        </section>

        {/* Social Proof */}
        <section className="border-y border-border/60 bg-secondary/40 py-12">
          <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-10 opacity-80">
            {[
              { name: "Hartley Joinery", stars: 5 },
              { name: "TrueFlow Plumbing", stars: 5 },
              { name: "Apex Electrical", stars: 5 },
              { name: "City Builders", stars: 5 }
            ].map((company, i) => (
              <div key={i} className="flex items-center gap-4 grayscale-[0.3] hover:grayscale-0 transition-all cursor-default">
                <div className="flex gap-1 text-primary">
                  {Array.from({ length: company.stars }).map((_, j) => <Star key={j} className="w-5 h-5 fill-current" />)}
                </div>
                <span className="font-bold text-xl tracking-tight text-foreground/80">{company.name}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Features */}
        <section className="py-32 md:py-40">
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center mb-20">
               <h2 className="text-4xl md:text-5xl font-black tracking-tight mb-6">Everything you need to scale</h2>
               <p className="text-xl text-muted-foreground max-w-2xl mx-auto font-medium">Replace chaotic WhatsApp messages and scattered notes with a streamlined, professional system.</p>
            </div>
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
        <section className="bg-sidebar py-32 md:py-48 text-sidebar-foreground relative overflow-hidden">
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-5" />
          <div className="max-w-6xl mx-auto px-6 relative z-10">
            <div className="text-center mb-24">
              <h2 className="text-4xl md:text-6xl font-black tracking-tight mb-6">How it works</h2>
              <p className="text-sidebar-foreground/70 text-xl font-medium max-w-2xl mx-auto">Three simple steps to streamline your quoting process.</p>
            </div>
            
            <div className="grid md:grid-cols-3 gap-12 relative">
              <div className="hidden md:block absolute top-12 left-[10%] right-[10%] h-[2px] bg-sidebar-foreground/10 z-0" />
              
              <StepCard number="1" title="Customer chats" desc="They describe the job to your intelligent AI assistant on your website." />
              <StepCard number="2" title="You review leads" desc="See full summaries and AI-drafted quotes ready when you open the app." />
              <StepCard number="3" title="Send quote" desc="Tweak the numbers, verify the assumptions, and click send." />
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="bg-primary text-primary-foreground py-32 text-center relative overflow-hidden">
           <div className="absolute inset-0 bg-black/10" />
          <div className="max-w-4xl mx-auto px-6 relative z-10">
            <h2 className="text-5xl md:text-7xl font-black tracking-tighter mb-10">Ready to win more business?</h2>
            <Link href="/sign-up">
              <Button size="lg" className="text-xl font-black h-20 px-14 shadow-2xl hover-elevate rounded-2xl bg-background text-foreground hover:bg-background/90">
                Join WorkRate Today <ArrowRight className="ml-3 w-7 h-7" />
              </Button>
            </Link>
          </div>
        </section>
      </main>

      <footer className="py-12 border-t border-border/60 text-center text-muted-foreground font-semibold bg-card">
        <p className="text-base">&copy; {new Date().getFullYear()} WorkRate. All rights reserved.</p>
      </footer>
    </div>
  );
}

function Badge({ children, className }: { children: React.ReactNode, className?: string }) {
  return <span className={`inline-flex items-center rounded-full ${className}`}>{children}</span>;
}

function FeatureCard({ icon: Icon, title, description }: { icon: any, title: string, description: string }) {
  return (
    <div className="bg-card p-10 rounded-[2rem] border border-border/60 shadow-sm hover-elevate transition-all group">
      <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-8 text-primary group-hover:scale-110 group-hover:-rotate-3 transition-transform duration-300">
        <Icon className="w-8 h-8" />
      </div>
      <h3 className="text-2xl font-black mb-4 tracking-tight text-foreground">{title}</h3>
      <p className="text-muted-foreground leading-relaxed font-semibold text-lg">{description}</p>
    </div>
  );
}

function StepCard({ number, title, desc }: { number: string, title: string, desc: string }) {
  return (
    <div className="relative z-10 flex flex-col items-center text-center p-6 md:p-0">
      <div className="w-24 h-24 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-4xl font-black shadow-xl mb-8 border-8 border-sidebar">
        {number}
      </div>
      <h3 className="text-2xl font-bold mb-4">{title}</h3>
      <p className="text-sidebar-foreground/70 font-medium text-lg leading-relaxed">{desc}</p>
    </div>
  );
}