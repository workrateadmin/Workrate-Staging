import React, { useState, useEffect } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';
import { Heart, ArrowRight, Zap, Users, Sparkles, ArrowUpRight, Star } from 'lucide-react';

// ---------- Memphis SVG shapes ----------
const Squiggle = ({ className = '', stroke = '#000', width = 120 }) => (
  <svg className={className} width={width} viewBox="0 0 120 24" fill="none">
    <path d="M2 12c8-14 12 14 20 0s12 14 20 0 12 14 20 0 12 14 20 0 12 14 20 0" stroke={stroke} strokeWidth="5" strokeLinecap="round" />
  </svg>
);

const Cross = ({ className = '', fill = '#000', size = 28 }) => (
  <svg className={className} width={size} height={size} viewBox="0 0 28 28">
    <path d="M11 0h6v11h11v6H17v11h-6V17H0v-6h11V0z" fill={fill} />
  </svg>
);

const HalfPipe = ({ className = '', fill = '#000', size = 60 }) => (
  <svg className={className} width={size} height={size / 2} viewBox="0 0 60 30">
    <path d="M0 30a30 30 0 0 1 60 0H0z" fill={fill} />
  </svg>
);

const ZigZag = ({ className = '', stroke = '#000', width = 100 }) => (
  <svg className={className} width={width} viewBox="0 0 100 20" fill="none">
    <path d="M2 18 14 2l12 16L38 2l12 16L62 2l12 16L86 2l12 16" stroke={stroke} strokeWidth="5" strokeLinejoin="round" strokeLinecap="round" />
  </svg>
);

// ---------- Data ----------
const PRODUCTS = [
  { id: 1, name: 'Carlton Loveseat', tag: 'Seating', price: 1890, claims: 412, img: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=800&h=640&fit=crop', color: '#FF4D8D', pattern: 'dots', blurb: 'Two seats. Zero excuses.' },
  { id: 2, name: 'Ultrafragola Mirror', tag: 'Decor', price: 2400, claims: 287, img: 'https://images.unsplash.com/photo-1618220179428-22790b461013?w=800&h=640&fit=crop', color: '#FFC700', pattern: 'zig', blurb: 'Check yourselves out. Together.' },
  { id: 3, name: 'Tahiti Duo Lamp', tag: 'Lighting', price: 640, claims: 951, img: 'https://images.unsplash.com/photo-1513506003901-1e6a229e2d15?w=800&h=640&fit=crop', color: '#2EC4B6', pattern: 'dots', blurb: 'Mood lighting for first movers.' },
  { id: 4, name: 'Bel Air Armchair', tag: 'Seating', price: 1250, claims: 633, img: 'https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?w=800&h=640&fit=crop', color: '#3A36E0', pattern: 'zig', blurb: 'One chair. Negotiate bravely.' },
  { id: 5, name: 'First-Date Side Table', tag: 'Tables', price: 480, claims: 1208, img: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=800&h=640&fit=crop', color: '#FF4D8D', pattern: 'zig', blurb: 'Holds two espressos and the tension.' },
  { id: 6, name: 'Squiggle Bookcase', tag: 'Storage', price: 980, claims: 366, img: 'https://images.unsplash.com/photo-1594620302200-9a762244a156?w=800&h=640&fit=crop', color: '#FFC700', pattern: 'dots', blurb: 'Merge libraries. The ultimate commitment.' },
];

const TABS = ['All', 'Seating', 'Lighting', 'Tables', 'Decor', 'Storage'];

const QUESTS = [
  { icon: Zap, color: '#FF4D8D', title: 'The First Apartment Sprint', copy: '14 days. One shared moodboard. Furnish a 600 sq ft flat with your match before the timer hits zero.', members: '3,402 duos in' },
  { icon: Users, color: '#2EC4B6', title: 'Squad Sofa Summit', copy: 'Bring four friends. Vote on one statement couch. Loser of the vote hosts the housewarming.', members: '1,187 squads in' },
  { icon: Sparkles, color: '#FFC700', title: 'Clash of Tastes', copy: 'Maximalist matched with a minimalist? Build a room you both defend. The community crowns the bravest.', members: '8,940 voters live' },
];

// ---------- Pattern backgrounds ----------
const patternStyle = (type, color) =>
  type === 'dots'
    ? { backgroundImage: `radial-gradient(${color} 2.5px, transparent 2.5px)`, backgroundSize: '18px 18px' }
    : { backgroundImage: `repeating-linear-gradient(45deg, ${color} 0 8px, transparent 8px 22px)` };

export default function App() {
  const [tab, setTab] = useState('All');
  const [claimed, setClaimed] = useState({});
  const [hoverCursor, setHoverCursor] = useState(false);

  const mx = useMotionValue(-200);
  const my = useMotionValue(-200);
  const ringX = useSpring(mx, { stiffness: 600, damping: 32 });
  const ringY = useSpring(my, { stiffness: 600, damping: 32 });
  const trail1X = useSpring(mx, { stiffness: 140, damping: 18 });
  const trail1Y = useSpring(my, { stiffness: 140, damping: 18 });
  const trail2X = useSpring(mx, { stiffness: 70, damping: 16 });
  const trail2Y = useSpring(my, { stiffness: 70, damping: 16 });
  const trail3X = useSpring(mx, { stiffness: 40, damping: 14 });
  const trail3Y = useSpring(my, { stiffness: 40, damping: 14 });

  useEffect(() => {
    const move = (e) => {
      mx.set(e.clientX);
      my.set(e.clientY);
      setHoverCursor(!!(e.target.closest && e.target.closest('[data-cursor]')));
    };
    window.addEventListener('mousemove', move);
    return () => window.removeEventListener('mousemove', move);
  }, [mx, my]);

  const toggleClaim = (id) => setClaimed((c) => ({ ...c, [id]: !c[id] }));

  const products = tab === 'All' ? PRODUCTS : PRODUCTS.filter((p) => p.tag === tab);

  return (
    <div className="nm-root min-h-screen bg-[#FFF6E9] text-black overflow-x-hidden" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Space+Grotesk:wght@400;500;700&display=swap" rel="stylesheet" />
      <style dangerouslySetInnerHTML={{ __html: `
        .nm-root, .nm-root * { cursor: none !important; }
        @media (pointer: coarse) { .nm-root, .nm-root * { cursor: auto !important; } .nm-cursor { display: none; } }
        .display { font-family: 'Archivo Black', sans-serif; }
        @keyframes marquee { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        .marquee-track { animation: marquee 22s linear infinite; }
        @keyframes spinSlow { to { transform: rotate(360deg); } }
        @keyframes bobble { 0%,100% { transform: translateY(0) rotate(-6deg);} 50% { transform: translateY(-14px) rotate(6deg);} }
        .bobble { animation: bobble 4s ease-in-out infinite; }
        .hard { box-shadow: 7px 7px 0 #000; }
        .hard-sm { box-shadow: 4px 4px 0 #000; }
        .hard-pink { box-shadow: 7px 7px 0 #FF4D8D; }
        .hard-blue { box-shadow: 7px 7px 0 #3A36E0; }
        .lift { transition: transform .18s cubic-bezier(.34,1.56,.64,1), box-shadow .18s; }
        .lift:hover { transform: translate(-3px,-3px); box-shadow: 11px 11px 0 #000; }
        .terrazzo {
          background-color: #FFF6E9;
          background-image:
            radial-gradient(#2EC4B6 3px, transparent 3px),
            radial-gradient(#FF4D8D 2.5px, transparent 2.5px),
            radial-gradient(#FFC700 2px, transparent 2px);
          background-size: 90px 90px, 70px 70px, 50px 50px;
          background-position: 0 0, 30px 40px, 60px 10px;
        }
        ::selection { background: #FF4D8D; color: #fff; }
      `}} />

      {/* ---------- Custom cursor + trail ---------- */}
      <motion.div className="nm-cursor fixed top-0 left-0 z-[100] pointer-events-none" style={{ x: trail3X, y: trail3Y, translateX: '-50%', translateY: '-50%' }}>
        <Squiggle width={54} stroke="#FFC700" />
      </motion.div>
      <motion.div className="nm-cursor fixed top-0 left-0 z-[100] pointer-events-none" style={{ x: trail2X, y: trail2Y, translateX: '-50%', translateY: '-50%' }}>
        <Cross size={20} fill="#2EC4B6" />
      </motion.div>
      <motion.div className="nm-cursor fixed top-0 left-0 z-[100] pointer-events-none" style={{ x: trail1X, y: trail1Y, translateX: '-50%', translateY: '-50%' }}>
        <div className="w-3 h-3 rounded-full bg-[#3A36E0] border-2 border-black" />
      </motion.div>
      <motion.div className="nm-cursor fixed top-0 left-0 z-[101] pointer-events-none flex items-center justify-center"
        style={{ x: ringX, y: ringY, translateX: '-50%', translateY: '-50%' }}
        animate={{ scale: hoverCursor ? 1.6 : 1, rotate: hoverCursor ? 12 : 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 22 }}>
        <div className="relative flex items-center justify-center">
          <div className={`w-9 h-9 rounded-full border-[3px] border-black ${hoverCursor ? 'bg-[#FF4D8D]' : 'bg-[#FFC700]'} transition-colors duration-150`} />
          <Heart size={14} className="absolute text-black" fill={hoverCursor ? '#fff' : 'transparent'} strokeWidth={2.5} />
        </div>
      </motion.div>

      {/* ---------- Marquee ---------- */}
      <div className="bg-black text-[#FFF6E9] overflow-hidden border-b-[3px] border-black">
        <div className="marquee-track flex whitespace-nowrap py-2 will-change-transform">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="flex items-center gap-6 pr-6 text-sm font-bold tracking-[0.2em] uppercase">
              {['Match boldly', 'Furnish bravely', 'Move in like heroes', 'No beige allowed', '12,408 couches co-claimed'].map((t, j) => (
                <React.Fragment key={j}>
                  <span>{t}</span>
                  <span className="text-[#FF4D8D]">✦</span>
                </React.Fragment>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ---------- Nav ---------- */}
      <nav className="flex items-center justify-between px-6 md:px-12 py-5 border-b-[3px] border-black bg-[#FFF6E9] sticky top-0 z-40">
        <div className="flex items-center gap-3" data-cursor>
          <div className="w-10 h-10 bg-[#FF4D8D] border-[3px] border-black rounded-tl-full rounded-br-full flex items-center justify-center hard-sm">
            <Heart size={18} strokeWidth={3} />
          </div>
          <span className="display text-2xl tracking-tight">NESTMATCH</span>
          <span className="hidden md:inline-block text-[10px] font-bold uppercase tracking-widest bg-[#2EC4B6] border-2 border-black px-2 py-0.5 -rotate-3">by Spark Social</span>
        </div>
        <div className="hidden lg:flex items-center gap-8 text-sm font-bold uppercase tracking-wider">
          {['The Drop', 'Duo Quests', 'Squad Rooms', 'Stories'].map((l) => (
            <a key={l} href="#" data-cursor className="relative group">
              {l}
              <span className="absolute -bottom-1 left-0 w-0 h-[3px] bg-[#FF4D8D] group-hover:w-full transition-all duration-200" />
            </a>
          ))}
        </div>
        <button data-cursor className="display text-sm bg-[#FFC700] border-[3px] border-black px-5 py-2.5 hard-sm lift uppercase">
          Find your duo
        </button>
      </nav>

      {/* ---------- Hero ---------- */}
      <header className="relative border-b-[3px] border-black overflow-hidden">
        <div className="absolute inset-0 terrazzo opacity-60" />
        {/* floating shapes */}
        <Cross className="absolute top-16 left-[6%] bobble hidden md:block" fill="#3A36E0" size={44} />
        <ZigZag className="absolute bottom-12 left-[42%] hidden md:block" stroke="#FF4D8D" width={140} />
        <HalfPipe className="absolute top-10 right-[8%] rotate-180 hidden md:block" fill="#2EC4B6" size={90} />
        <div className="absolute bottom-24 right-[44%] w-12 h-12 rounded-full border-[5px] border-[#FFC700] hidden md:block" style={{ animation: 'spinSlow 14s linear infinite' }} />

        <div className="relative grid lg:grid-cols-[1.15fr_1fr] gap-10 px-6 md:px-12 py-16 md:py-24 max-w-[1400px] mx-auto items-center">
          <div>
            <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
              <div className="inline-flex items-center gap-2 bg-white border-[3px] border-black px-4 py-2 hard-sm -rotate-2 mb-8">
                <Star size={16} fill="#FFC700" strokeWidth={2.5} />
                <span className="text-xs font-bold uppercase tracking-[0.18em]">The furniture arm of your favorite dating app</span>
              </div>
              <h1 className="display text-[clamp(2.8rem,7vw,6rem)] leading-[0.95] uppercase">
                Claim the
                <span className="relative inline-block mx-3 px-3 bg-[#FF4D8D] text-white border-[4px] border-black -rotate-2 hard">couch.</span>
                <br />
                Claim the
                <span className="relative inline-block mx-3 px-3 bg-[#2EC4B6] border-[4px] border-black rotate-1 hard">person.</span>
              </h1>
              <p className="mt-8 max-w-xl text-lg md:text-xl font-medium leading-relaxed">
                Swiping is easy. Picking a sofa with someone? That takes guts.
                NestMatch turns matches into missions — co-claim pieces, build rooms together,
                and let the community judge your bravest taste.
              </p>
              <div className="mt-10 flex flex-wrap gap-5">
                <button data-cursor className="display group flex items-center gap-3 bg-black text-[#FFF6E9] px-7 py-4 border-[3px] border-black hard-pink lift uppercase text-base">
                  Start a duo quest <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                </button>
                <button data-cursor className="display flex items-center gap-3 bg-white px-7 py-4 border-[3px] border-black hard-blue lift uppercase text-base">
                  Browse the drop
                </button>
              </div>
              <div className="mt-12 flex flex-wrap gap-x-10 gap-y-4">
                {[['12,408', 'couches co-claimed'], ['96%', 'still talking after delivery'], ['41 sec', 'avg. time to first argument']].map(([n, l]) => (
                  <div key={l}>
                    <div className="display text-3xl">{n}</div>
                    <div className="text-xs font-bold uppercase tracking-widest mt-1 text-black/60">{l}</div>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>

          {/* Hero collage */}
          <motion.div initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6, delay: 0.15 }} className="relative h-[460px] md:h-[540px] hidden sm:block">
            <div className="absolute top-0 right-4 w-[72%] border-[4px] border-black hard rotate-2 bg-white p-3" data-cursor>
              <img src="https://images.unsplash.com/photo-1540574163026-643ea20ade25?w=800&h=600&fit=crop" alt="bold sofa" className="w-full h-64 object-cover border-[3px] border-black" />
              <div className="flex items-center justify-between pt-3 px-1">
                <span className="display text-sm uppercase">The Carlton Loveseat</span>
                <span className="bg-[#FFC700] border-2 border-black px-2 py-0.5 text-xs font-bold">Co-claimed ♥ ×2</span>
              </div>
            </div>
            <div className="absolute bottom-0 left-0 w-[58%] border-[4px] border-black hard -rotate-3 bg-white p-3" data-cursor>
              <img src="https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?w=700&h=500&fit=crop" alt="lamp corner" className="w-full h-48 object-cover border-[3px] border-black" />
              <div className="flex items-center gap-2 pt-3 px-1">
                <div className="flex -space-x-2">
                  <div className="w-7 h-7 rounded-full bg-[#FF4D8D] border-2 border-black" />
                  <div className="w-7 h-7 rounded-full bg-[#3A36E0] border-2 border-black" />
                </div>
                <span className="text-xs font-bold uppercase tracking-wider">Maya + Theo · Day 9 of 14</span>
              </div>
            </div>
            <div className="absolute top-[38%] left-[44%] -rotate-6 bg-[#3A36E0] text-white border-[4px] border-black hard px-5 py-4 bobble" data-cursor>
              <div className="display text-lg uppercase leading-tight">It's a<br />match… of taste</div>
              <Squiggle width={90} stroke="#FFC700" className="mt-2" />
            </div>
          </motion.div>
        </div>
      </header>

      {/* ---------- Product drop ---------- */}
      <section className="px-6 md:px-12 py-16 md:py-24 max-w-[1400px] mx-auto">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-10">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <ZigZag stroke="#3A36E0" width={80} />
              <span className="text-xs font-bold uppercase tracking-[0.25em]">Drop 07 · Postmodern Courage</span>
            </div>
            <h2 className="display text-4xl md:text-6xl uppercase leading-none">Pieces worth<br />fighting <span className="bg-[#FFC700] px-2 border-[3px] border-black inline-block -rotate-1">for</span></h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {TABS.map((t) => (
              <button key={t} data-cursor onClick={() => setTab(t)}
                className={`px-4 py-2 border-[3px] border-black text-sm font-bold uppercase tracking-wide hard-sm lift ${tab === t ? 'bg-black text-[#FFF6E9]' : 'bg-white'}`}>
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {products.map((p, i) => (
            <motion.article key={p.id} layout initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: i * 0.05 }}
              className={`relative border-[4px] border-black bg-white hard lift ${i % 3 === 1 ? 'lg:translate-y-8' : ''}`} data-cursor>
              <div className="p-3 pb-0 relative">
                <div className="absolute inset-3 bottom-0 z-0" style={patternStyle(p.pattern, p.color)} />
                <img src={p.img} alt={p.name} className="relative z-10 w-full h-56 object-cover border-[3px] border-black translate-x-2 -translate-y-2 hover:translate-x-0 hover:translate-y-0 transition-transform duration-200" />
                <div className="absolute top-6 left-6 z-20 bg-black text-white text-[10px] font-bold uppercase tracking-widest px-2 py-1 -rotate-3">{p.tag}</div>
              </div>
              <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="display text-xl uppercase leading-tight">{p.name}</h3>
                    <p className="text-sm font-medium text-black/60 mt-1">{p.blurb}</p>
                  </div>
                  <div className="display text-xl whitespace-nowrap bg-[#FFF6E9] border-2 border-black px-2 py-1 rotate-2">${p.price.toLocaleString()}</div>
                </div>
                <div className="mt-5 flex items-center justify-between">
                  <button data-cursor onClick={() => toggleClaim(p.id)}
                    className={`flex items-center gap-2 px-4 py-2.5 border-[3px] border-black text-sm font-bold uppercase tracking-wide hard-sm transition-colors ${claimed[p.id] ? 'bg-[#FF4D8D] text-white' : 'bg-[#FFC700]'}`}>
                    <Heart size={16} strokeWidth={3} fill={claimed[p.id] ? '#fff' : 'transparent'} />
                    {claimed[p.id] ? 'Co-claimed!' : 'Co-claim it'}
                  </button>
                  <span className="text-xs font-bold uppercase tracking-wider text-black/50">
                    ♥ {(p.claims + (claimed[p.id] ? 1 : 0)).toLocaleString()} duos
                  </span>
                </div>
              </div>
              <div className="absolute -top-3 -right-3"><Cross fill={p.color} size={26} /></div>
            </motion.article>
          ))}
        </div>
      </section>

      {/* ---------- Duo quests / community ---------- */}
      <section className="border-y-[3px] border-black bg-[#3A36E0] text-[#FFF6E9] relative overflow-hidden">
        <Squiggle className="absolute top-8 right-10 hidden md:block" stroke="#FF4D8D" width={180} />
        <div className="absolute -bottom-8 -left-8 w-40 h-40 rounded-full border-[10px] border-[#FFC700]" style={{ animation: 'spinSlow 20s linear infinite' }} />
        <div className="relative px-6 md:px-12 py-16 md:py-24 max-w-[1400px] mx-auto">
          <div className="max-w-2xl mb-12">
            <span className="inline-block bg-[#FF4D8D] border-[3px] border-black text-white text-xs font-bold uppercase tracking-[0.25em] px-3 py-1.5 -rotate-2 hard-sm mb-5">Community quests</span>
            <h2 className="display text-4xl md:text-6xl uppercase leading-[0.95]">Furnishing is the new third date</h2>
            <p className="mt-5 text-lg font-medium text-white/85">Join time-boxed challenges with your match, your situationship, or your whole group chat. Winners get the room. Everyone gets the story.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {QUESTS.map((q, i) => (
              <div key={q.title} data-cursor className={`bg-[#FFF6E9] text-black border-[4px] border-black p-6 hard lift ${i === 1 ? 'md:-translate-y-6' : ''}`}>
                <div className="w-12 h-12 border-[3px] border-black flex items-center justify-center mb-5 rounded-tr-2xl" style={{ background: q.color }}>
                  <q.icon size={22} strokeWidth={2.5} />
                </div>
                <h3 className="display text-xl uppercase leading-tight">{q.title}</h3>
                <p className="mt-3 text-sm font-medium leading-relaxed text-black/70">{q.copy}</p>
                <div className="mt-6 flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-widest bg-black text-white px-2 py-1">{q.members}</span>
                  <ArrowUpRight size={20} strokeWidth={3} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Footer CTA ---------- */}
      <footer className="relative px-6 md:px-12 py-20 md:py-28 text-center terrazzo">
        <HalfPipe className="absolute top-10 left-[10%] hidden md:block" fill="#FF4D8D" size={70} />
        <Cross className="absolute bottom-16 right-[12%] bobble hidden md:block" fill="#2EC4B6" size={36} />
        <h2 className="display text-[clamp(2.2rem,6vw,5rem)] uppercase leading-[0.95] max-w-4xl mx-auto">
          Be brave enough to share a <span className="inline-block bg-[#FF4D8D] text-white border-[4px] border-black px-3 -rotate-2 hard">bookshelf</span>
        </h2>
        <p className="mt-6 text-lg font-medium max-w-xl mx-auto text-black/70">Download Spark, match on taste, and unlock NestMatch duo pricing. Heroes don't decorate alone.</p>
        <button data-cursor className="display mt-10 inline-flex items-center gap-3 bg-black text-[#FFF6E9] px-9 py-5 border-[3px] border-black hard-pink lift uppercase text-lg">
          Claim your nest <ArrowRight size={22} />
        </button>
        <div className="mt-16 pt-8 border-t-[3px] border-black flex flex-col md:flex-row items-center justify-between gap-4 max-w-[1400px] mx-auto text-xs font-bold uppercase tracking-widest text-black/60">
          <span>© 1986–2025 NestMatch · A Spark Social experiment</span>
          <div className="flex gap-6">
            {['Returns (of furniture, not feelings)', 'Care guide', 'Press'].map((l) => <a key={l} href="#" data-cursor className="hover:text-[#FF4D8D] transition-colors">{l}</a>)}
          </div>
        </div>
      </footer>
    </div>
  );
}