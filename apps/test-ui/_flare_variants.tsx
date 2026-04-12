import React from "react";

export function Variant1() {
  return (
    <div className="grid md:grid-cols-2 gap-12 md:gap-16 items-center">
      <div className="animate-[fadeUp_0.8s_ease_both]">
        <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", padding: "6px 14px", borderRadius: "9999px", background: "#1a1a1a", color: "white", fontSize: "12px", fontWeight: 500, marginBottom: "28px" }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#2ed48f" }} />
          Now accepting early access
        </div>
        <h1 className="font-[Playfair_Display,Georgia,serif] text-[clamp(40px,6vw,72px)] font-medium leading-[1.05] tracking-[-0.02em] mb-6">
          Lighting that<br /><em className="font-[Playfair_Display,Georgia,serif]">understands</em>.
        </h1>
        <p className="text-lg text-[#666] leading-relaxed max-w-md mb-10 font-light">
          A system so intuitive it anticipates your needs. No switches, no schedules — just light that works.
        </p>
        <div className="flex flex-wrap gap-8">
          <a href="#waitlist" className="px-7 py-3.5 bg-[#1a1a1a] text-white text-[15px] font-medium rounded-full hover:bg-[#333] transition-colors">Request Access</a>
          <a href="#features" className="px-7 py-3.5 text-[15px] font-medium rounded-full border border-[#ddd] text-[#555] hover:border-[#bbb] hover:text-[#1a1a1a] transition-colors">Watch Demo</a>
        </div>
      </div>
      <div className="animate-[fadeUp_0.8s_ease_0.15s_both]">
        <img alt="Minimal pendant light in a bright room" className="w-full h-120 object-cover rounded-2xl" src="https://images.unsplash.com/photo-1540932239986-30128078f3c5?w=800&h=900&fit=crop&q=80" />
      </div>
    </div>
  );
}

export function Variant2() {
  return (
    <div className="grid md:grid-cols-2 gap-12 md:gap-16 items-center">
      <div className="animate-[fadeUp_0.8s_ease_both]">
        <p className="text-xs font-medium tracking-[0.15em] uppercase text-[#999] mb-5">The future of home lighting</p>
        <h1 className="font-[Playfair_Display,Georgia,serif] text-[clamp(40px,6vw,72px)] font-medium leading-[1.05] tracking-[-0.02em] mb-4">
          Light that<br /><em className="font-[Playfair_Display,Georgia,serif]">lives</em><br />with you.
        </h1>
        <div className="flex flex-wrap gap-8 mb-10">
          <span className="text-sm text-[#999]">Circadian</span>
          <span className="text-sm text-[#ddd]">·</span>
          <span className="text-sm text-[#999]">Adaptive</span>
          <span className="text-sm text-[#ddd]">·</span>
          <span className="text-sm text-[#999]">Invisible</span>
        </div>
        <p className="text-lg text-[#666] leading-relaxed max-w-md mb-10 font-light">
          An intelligent lighting system that adapts to your sleep, your mood, your space. No switches. No schedules.
        </p>
        <a href="#waitlist" className="px-7 py-3.5 bg-[#1a1a1a] text-white text-[15px] font-medium rounded-full hover:bg-[#333] transition-colors">Get Early Access →</a>
      </div>
      <div className="animate-[fadeUp_0.8s_ease_0.15s_both]">
        <img alt="Minimal pendant light in a bright room" className="w-full h-120 object-cover rounded-2xl" src="https://images.unsplash.com/photo-1540932239986-30128078f3c5?w=800&h=900&fit=crop&q=80" />
      </div>
    </div>
  );
}

export function Variant3() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
      <div className="animate-[fadeUp_0.8s_ease_both]" style={{ maxWidth: "700px" }}>
        <p className="text-xs font-medium tracking-[0.15em] uppercase text-[#999] mb-5">Now in private beta</p>
        <h1 className="font-[Playfair_Display,Georgia,serif] text-[clamp(40px,6vw,72px)] font-medium leading-[1.05] tracking-[-0.02em] mb-10">
          The last lighting system<br />you'll ever <em className="font-[Playfair_Display,Georgia,serif]">need</em>.
        </h1>
        <p className="text-lg text-[#666] leading-relaxed mb-10 font-light" style={{ maxWidth: "520px", margin: "0 auto 40px" }}>
          Intelligent. Adaptive. Beautiful. A lighting system that reads the room and creates the perfect atmosphere — automatically.
        </p>
        <div className="flex flex-wrap gap-8" style={{ justifyContent: "center" }}>
          <a href="#waitlist" className="px-7 py-3.5 bg-[#1a1a1a] text-white text-[15px] font-medium rounded-full hover:bg-[#333] transition-colors">Get Early Access</a>
          <a href="#features" className="px-7 py-3.5 text-[15px] font-medium rounded-full border border-[#ddd] text-[#555] hover:border-[#bbb] hover:text-[#1a1a1a] transition-colors">Learn More</a>
        </div>
      </div>
      <div className="animate-[fadeUp_0.8s_ease_0.15s_both]" style={{ width: "100%", marginTop: "48px" }}>
        <img alt="Minimal pendant light in a bright room" className="w-full object-cover rounded-2xl" style={{ height: "400px" }} src="https://images.unsplash.com/photo-1540932239986-30128078f3c5?w=1200&h=600&fit=crop&q=80" />
      </div>
    </div>
  );
}
