import { useState } from "react";

/* ── Data ────────────────────────────────────── */

const plans = [
  {
    id: "essentials",
    name: "Essentials",
    price: "$9",
    period: "/mo",
    desc: "One room, beautifully lit.",
    features: ["1 Luma Hub", "Up to 8 bulbs", "Basic scenes", "Voice control"],
  },
  {
    id: "home",
    name: "Home",
    price: "$29",
    period: "/mo",
    desc: "Every room in your home.",
    features: [
      "3 Luma Hubs",
      "Unlimited bulbs",
      "Circadian rhythm",
      "Multi-room sync",
      "Scene composer",
    ],
    popular: true,
  },
  {
    id: "studio",
    name: "Studio",
    price: "$79",
    period: "/mo",
    desc: "For creators & professionals.",
    features: [
      "10 Luma Hubs",
      "Unlimited bulbs",
      "DMX bridge",
      "Full API access",
      "Priority support",
      "Custom firmware",
    ],
  },
];

const features = [
  {
    title: "Circadian Engine",
    desc: "Adapts colour temperature throughout the day to match your body's natural rhythm.",
    img: "https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?w=600&h=400&fit=crop&q=80",
  },
  {
    title: "Scene Composer",
    desc: "Build cinematic light scenes with our spatial editor. Layer, blend, transition — effortlessly.",
    img: "https://images.unsplash.com/photo-1513506003901-1e6a229e2d15?w=600&h=400&fit=crop&q=80",
  },
  {
    title: "Mesh Intelligence",
    desc: "Every bulb communicates. Self-healing, zero dead-zones, sub-8ms latency across your space.",
    img: "https://images.unsplash.com/photo-1524758631624-e2822e304c36?w=600&h=400&fit=crop&q=80",
  },
];

const testimonials = [
  {
    name: "Mika T.",
    role: "Interior Designer",
    text: "Luma completely changed how I think about space. The light itself becomes material.",
  },
  {
    name: "Jordan K.",
    role: "Software Engineer",
    text: "The API is beautifully documented. I automated my entire loft in a single afternoon.",
  },
  {
    name: "Ava R.",
    role: "Photographer",
    text: "I use Luma in my studio. The colour accuracy is better than fixtures ten times the price.",
  },
];

const devices = [
  {
    name: "Luma Bulb A19",
    zone: "Living Room",
    status: "online",
    brightness: 85,
  },
  { name: "Luma Strip Pro", zone: "Kitchen", status: "online", brightness: 60 },
  { name: "Luma Spot", zone: "Bedroom", status: "offline", brightness: 0 },
];

/* ── App ─────────────────────────────────────── */

export default function App() {
  const [selectedPlan, setSelectedPlan] = useState("home");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [interest, setInterest] = useState("home");
  const [agreed, setAgreed] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  return (
    <div className="min-h-screen bg-[#faf9f7] text-[#1a1a1a] font-[Figtree,system-ui,sans-serif]">
      {/* ── Nav ──────────────────────────────── */}
      <nav className="sticky top-0 z-50 bg-[#faf9f7]/80 backdrop-blur-md border-b border-black/5">
        <div className="max-w-300 mx-auto px-6 h-16 flex items-center justify-between">
          <a
            href="#"
            className="font-[Playfair_Display,Georgia,serif] text-xl font-semibold tracking-tight"
          >
            Luma
          </a>
          <div className="flex items-center gap-6">
            <a
              href="#features"
              className="text-sm text-[#666] hover:text-[#1a1a1a] transition-colors hidden sm:block"
            >
              Features
            </a>
            <a
              href="#pricing"
              className="text-sm text-[#666] hover:text-[#1a1a1a] transition-colors hidden sm:block"
            >
              Pricing
            </a>
            <a
              href="#reviews"
              className="text-sm text-[#666] hover:text-[#1a1a1a] transition-colors hidden sm:block"
            >
              Reviews
            </a>
            <a
              href="#waitlist"
              className="text-[13px] font-medium px-6 py-2 bg-[#1a1a1a] text-white rounded-full hover:bg-[#333] transition-colors"
            >
              Join Waitlist
            </a>
          </div>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────── */}
      <header className="max-w-300 mx-auto px-6 pt-24 pb-20 md:pt-32 md:pb-28">
        <div className="grid md:grid-cols-2 gap-12 md:gap-16 items-center">
          <div className="animate-[fadeUp_0.8s_ease_both]">
            <p className="text-xs font-medium tracking-[0.15em] uppercase text-[#999] mb-5">
              Now in private beta
            </p>
            <h1 className="font-[Playfair_Display,Georgia,serif] text-[clamp(40px,6vw,72px)] font-medium leading-[1.05] tracking-[-0.02em] mb-10">
              Light that
              <br />
              <em className="font-[Playfair_Display,Georgia,serif]">
                gets
              </em>{" "}
              you.
            </h1>
            <p className="text-lg text-[#666] leading-relaxed max-w-md mb-10 font-light">
              An intelligent lighting system that adapts to your sleep, your
              mood, your space. No switches. No schedules.
            </p>
            <div className="flex flex-wrap gap-8">
              <a
                href="#waitlist"
                className="px-7 py-3.5 bg-[#1a1a1a] text-white text-[15px] font-medium rounded-full hover:bg-[#333] transition-colors"
              >
                Get Early Access
              </a>
              <a
                href="#features"
                className="px-7 py-3.5 text-[15px] font-medium rounded-full border border-[#ddd] text-[#555] hover:border-[#bbb] hover:text-[#1a1a1a] transition-colors"
              >
                Learn More
              </a>
            </div>
          </div>
          <div className="animate-[fadeUp_0.8s_ease_0.15s_both]">
            <img
              src="https://images.unsplash.com/photo-1540932239986-30128078f3c5?w=800&h=900&fit=crop&q=80"
              alt="Minimal pendant light in a bright room"
              className="w-full h-120 object-cover rounded-2xl"
            />
          </div>
        </div>

        {/* Stats row */}
        <div className="flex items-center justify-start gap-10 mt-20 animate-[fadeUp_0.8s_ease_0.3s_both]">
          {[
            ["12,000+", "On the waitlist"],
            ["99.97%", "System uptime"],
            ["<8ms", "Response latency"],
            ["50+", "Integrations"],
          ].map(([num, label]) => (
            <div key={label}>
              <div className="font-[Playfair_Display,Georgia,serif] text-[28px] font-medium tracking-tight">
                {num}
              </div>
              <div className="text-xs text-[#999] tracking-wide uppercase mt-1">
                {label}
              </div>
            </div>
          ))}
        </div>
      </header>

      {/* ── Full-width image break ───────────── */}
      <div className="w-full h-[50vh] min-h-90 overflow-hidden">
        <img
          src="https://images.unsplash.com/photo-1600210492493-0946911123ea?w=1800&h=800&fit=crop&q=80"
          alt="Beautifully lit living room interior"
          className="w-full h-full object-cover"
        />
      </div>

      {/* ── Features ─────────────────────────── */}
      <section id="features" className="max-w-300 mx-auto px-6 py-24 md:py-32">
        <p className="text-xs font-medium tracking-[0.15em] uppercase text-[#999] mb-3">
          Capabilities
        </p>
        <h2 className="font-[Playfair_Display,Georgia,serif] text-[clamp(28px,4vw,44px)] font-medium tracking-tight leading-snug mb-16 max-w-lg">
          Designed around the way light should behave
        </h2>
        <div className="grid md:grid-cols-3 gap-6">
          {features.map((f) => (
            <div key={f.title} className="group">
              <div className="overflow-hidden rounded-3xl mb-5">
                <img
                  src={f.img}
                  alt={f.title}
                  className="w-full h-56 object-cover transition-transform duration-500 group-hover:scale-105"
                />
              </div>
              <h3 className="text-base font-semibold mb-2">{f.title}</h3>
              <p className="text-sm text-[#777] leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Pricing ──────────────────────────── */}
      <section id="pricing" className="bg-[#f3f2ef]">
        <div className="max-w-300 mx-auto px-6 py-24 md:py-32">
          <p className="text-xs font-medium tracking-[0.15em] uppercase text-[#999] mb-3">
            Pricing
          </p>
          <h2 className="font-[Playfair_Display,Georgia,serif] text-[clamp(28px,4vw,44px)] font-medium tracking-tight leading-snug mb-16 max-w-md">
            Choose what suits your space
          </h2>
          <div className="grid md:grid-cols-3 gap-5">
            {plans.map((p) => (
              <div
                key={p.id}
                onClick={() => setSelectedPlan(p.id)}
                className={`relative bg-white rounded-2xl p-8 cursor-pointer transition-all duration-200 border-2 ${
                  selectedPlan === p.id
                    ? "border-[#1a1a1a] shadow-[0_2px_24px_rgba(0,0,0,0.06)]"
                    : "border-transparent hover:border-[#ddd]"
                }`}
              >
                {p.popular && (
                  <span className="absolute -top-3 left-8 text-[11px] font-semibold uppercase tracking-wider bg-[#1a1a1a] text-white px-4 py-1 rounded-full">
                    Popular
                  </span>
                )}
                <h3 className="text-lg font-semibold mb-1">{p.name}</h3>
                <p className="text-sm text-[#999] mb-6">{p.desc}</p>
                <div className="flex items-baseline gap-1 mb-6">
                  <span className="font-[Playfair_Display,Georgia,serif] text-4xl font-semibold">
                    {p.price}
                  </span>
                  <span className="text-sm text-[#999]">{p.period}</span>
                </div>
                <ul className="space-y-2.5 mb-8">
                  {p.features.map((feat) => (
                    <li
                      key={feat}
                      className="text-sm text-[#555] flex items-start gap-2.5"
                    >
                      <svg
                        className="w-4 h-4 mt-0.5 text-[#1a1a1a] shrink-0"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                      {feat}
                    </li>
                  ))}
                </ul>
                <label className="flex items-center gap-3 text-sm cursor-pointer group/radio">
                  <span className="relative w-5 h-5 rounded-full border-2 border-[#ccc] group-hover/radio:border-[#999] transition-colors shrink-0">
                    <input
                      type="radio"
                      name="plan"
                      value={p.id}
                      checked={selectedPlan === p.id}
                      onChange={() => setSelectedPlan(p.id)}
                      className="sr-only peer"
                    />
                    <span className="absolute inset-1 rounded-full bg-[#1a1a1a] scale-0 peer-checked:scale-100 transition-transform" />
                  </span>
                  Select {p.name}
                </label>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Reviews ──────────────────────────── */}
      <section id="reviews" className="max-w-300 mx-auto px-6 py-24 md:py-32">
        <p className="text-xs font-medium tracking-[0.15em] uppercase text-[#999] mb-3">
          What people say
        </p>
        <h2 className="font-[Playfair_Display,Georgia,serif] text-[clamp(28px,4vw,44px)] font-medium tracking-tight leading-snug mb-16 max-w-md">
          Trusted by early adopters
        </h2>
        <div className="grid md:grid-cols-3 gap-6">
          {testimonials.map((t) => (
            <div key={t.name} className="border border-black/6 rounded-2xl p-8">
              <p className="text-[15px] leading-relaxed text-[#444] mb-8 italic">
                "{t.text}"
              </p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#e8e6e1] flex items-center justify-center text-sm font-semibold text-[#666]">
                  {t.name[0]}
                </div>
                <div>
                  <div className="text-sm font-medium">{t.name}</div>
                  <div className="text-xs text-[#999]">{t.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Element Showcase ─────────────────── */}
      <section className="bg-[#f3f2ef]">
        <div className="max-w-300 mx-auto px-6 py-24 md:py-32">
          <p className="text-xs font-medium tracking-[0.15em] uppercase text-[#999] mb-3">
            Dashboard Preview
          </p>
          <h2 className="font-[Playfair_Display,Georgia,serif] text-[clamp(28px,4vw,44px)] font-medium tracking-tight leading-snug mb-16 max-w-md">
            Your devices, at a glance
          </h2>

          {/* Buttons */}
          <div className="flex flex-wrap gap-3 mb-8">
            <button className="px-6 py-2.5 bg-[#1a1a1a] text-white text-sm font-medium rounded-full hover:bg-[#333] transition-colors">
              Primary
            </button>
            <button className="px-6 py-2.5 text-sm font-medium rounded-full border border-[#ddd] text-[#555] hover:border-[#bbb] transition-colors">
              Secondary
            </button>
            <button className="px-6 py-2.5 text-sm font-medium rounded-full text-[#999] hover:text-[#555] hover:bg-black/3 transition-colors">
              Tertiary
            </button>
            <button
              className="px-6 py-2.5 text-sm font-medium rounded-full border border-[#eee] text-[#ccc] cursor-not-allowed"
              disabled
            >
              Disabled
            </button>
          </div>

          {/* Badges */}
          <div className="flex flex-wrap gap-2 mb-10">
            <span className="px-3.5 py-1 rounded-full text-xs font-medium bg-[#1a1a1a] text-white">
              New
            </span>
            <span className="px-3.5 py-1 rounded-full text-xs font-medium bg-[#e8f5e9] text-[#2e7d32]">
              Active
            </span>
            <span className="px-3.5 py-1 rounded-full text-xs font-medium bg-[#fff3e0] text-[#e65100]">
              Beta
            </span>
            <span className="px-3.5 py-1 rounded-full text-xs font-medium bg-[#fce4ec] text-[#c62828]">
              Limited
            </span>
          </div>

          {/* Table */}
          <div className="bg-white rounded-2xl border border-black/5 overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-black/5">
                  <th className="px-6 py-4 text-[11px] font-semibold uppercase tracking-wider text-[#999]">
                    Device
                  </th>
                  <th className="px-6 py-4 text-[11px] font-semibold uppercase tracking-wider text-[#999]">
                    Zone
                  </th>
                  <th className="px-6 py-4 text-[11px] font-semibold uppercase tracking-wider text-[#999]">
                    Status
                  </th>
                  <th className="px-6 py-4 text-[11px] font-semibold uppercase tracking-wider text-[#999]">
                    Brightness
                  </th>
                </tr>
              </thead>
              <tbody>
                {devices.map((d, i) => (
                  <tr
                    key={d.name}
                    className={`hover:bg-[#faf9f7] transition-colors ${i < devices.length - 1 ? "border-b border-black/5" : ""}`}
                  >
                    <td className="px-6 py-4 font-medium">{d.name}</td>
                    <td className="px-6 py-4 text-[#666]">{d.zone}</td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-2">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            d.status === "online" ? "bg-[#2e7d32]" : "bg-[#ccc]"
                          }`}
                        />
                        <span className="text-[#666] capitalize">
                          {d.status}
                        </span>
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-20 h-1.5 bg-[#eee] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#1a1a1a] rounded-full transition-all duration-500"
                            style={{ width: `${d.brightness}%` }}
                          />
                        </div>
                        <span className="text-xs text-[#999] w-8">
                          {d.brightness}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── Waitlist ─────────────────────────── */}
      <section id="waitlist" className="max-w-300 mx-auto px-6 py-24 md:py-32">
        <div className="grid md:grid-cols-2 gap-16 items-start">
          <div>
            <p className="text-xs font-medium tracking-[0.15em] uppercase text-[#999] mb-3">
              Early Access
            </p>
            <h2 className="font-[Playfair_Display,Georgia,serif] text-[clamp(28px,4vw,44px)] font-medium tracking-tight leading-snug mb-5">
              Be among the first
            </h2>
            <p className="text-base text-[#777] leading-relaxed max-w-sm">
              We're rolling out access gradually. Reserve your spot and we'll
              notify you when it's your turn.
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-black/5 p-8 md:p-10">
            {submitted ? (
              <div className="text-center py-8">
                <div className="text-3xl mb-4">✓</div>
                <h3 className="font-[Playfair_Display,Georgia,serif] text-xl font-medium mb-2">
                  You're on the list
                </h3>
                <p className="text-sm text-[#999]">
                  We'll reach out when your spot opens up.
                </p>
              </div>
            ) : (
              <form
                className="space-y-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  setSubmitted(true);
                }}
              >
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label
                      htmlFor="wl-name"
                      className="text-[13px] font-medium text-[#555]"
                    >
                      Name
                    </label>
                    <input
                      id="wl-name"
                      type="text"
                      placeholder="Your name"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full px-4 py-3 text-sm border border-[#e0e0e0] rounded-xl bg-[#faf9f7] focus:outline-none focus:border-[#999] placeholder:text-[#bbb] transition-colors"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label
                      htmlFor="wl-email"
                      className="text-[13px] font-medium text-[#555]"
                    >
                      Email
                    </label>
                    <input
                      id="wl-email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-4 py-3 text-sm border border-[#e0e0e0] rounded-xl bg-[#faf9f7] focus:outline-none focus:border-[#999] placeholder:text-[#bbb] transition-colors"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label
                    htmlFor="wl-interest"
                    className="text-[13px] font-medium text-[#555]"
                  >
                    I'm interested in
                  </label>
                  <select
                    id="wl-interest"
                    value={interest}
                    onChange={(e) => setInterest(e.target.value)}
                    className="w-full px-4 py-3 text-sm border border-[#e0e0e0] rounded-xl bg-[#faf9f7] focus:outline-none focus:border-[#999] text-[#555] transition-colors appearance-none bg-[url('data:image/svg+xml,%3Csvg%20width%3D%2212%22%20height%3D%228%22%20viewBox%3D%220%200%2012%208%22%20fill%3D%22none%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cpath%20d%3D%22M1%201.5L6%206.5L11%201.5%22%20stroke%3D%22%23999%22%20stroke-width%3D%221.5%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-position-[right_14px_center]"
                  >
                    <option value="home">Home lighting</option>
                    <option value="studio">Studio / professional</option>
                    <option value="dev">Developer API</option>
                    <option value="commercial">Commercial spaces</option>
                  </select>
                </div>
                <label className="flex items-center gap-3 text-sm text-[#666] cursor-pointer group/check">
                  <span className="relative w-5 h-5 rounded-md border-2 border-[#ddd] group-hover/check:border-[#999] transition-colors shrink-0">
                    <input
                      type="checkbox"
                      checked={agreed}
                      onChange={() => setAgreed((a) => !a)}
                      className="sr-only peer"
                    />
                    <svg
                      className="absolute inset-0 w-full h-full p-0.75 text-white opacity-0 peer-checked:opacity-100 transition-opacity"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={3.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    <span className="absolute inset-0 rounded-sm bg-[#1a1a1a] scale-0 peer-checked:scale-100 transition-transform -z-10" />
                  </span>
                  I agree to receive product updates
                </label>
                <button
                  type="submit"
                  className="w-full py-3.5 bg-[#1a1a1a] text-white text-sm font-medium rounded-full hover:bg-[#333] transition-colors"
                >
                  Request Access
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────── */}
      <footer className="border-t border-black/5">
        <div className="max-w-300 mx-auto px-6 py-16">
          <div className="grid md:grid-cols-[1fr_auto] gap-16 mb-12">
            <div>
              <div className="font-[Playfair_Display,Georgia,serif] text-xl font-semibold mb-2">
                Luma
              </div>
              <p className="text-sm text-[#999]">Light that understands you.</p>
            </div>
            <div className="flex gap-16">
              {[
                {
                  title: "Product",
                  links: ["Features", "Pricing", "Changelog", "Roadmap"],
                },
                {
                  title: "Resources",
                  links: [
                    "Documentation",
                    "API Reference",
                    "Community",
                    "Blog",
                  ],
                },
                {
                  title: "Company",
                  links: ["About", "Careers", "Press", "Contact"],
                },
              ].map((col) => (
                <div key={col.title} className="space-y-3">
                  <h4 className="text-[13px] font-semibold">{col.title}</h4>
                  {col.links.map((link) => (
                    <a
                      key={link}
                      href="#"
                      className="block text-[13px] text-[#999] hover:text-[#555] transition-colors"
                    >
                      {link}
                    </a>
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pt-8 border-t border-black/5 text-xs text-[#bbb]">
            <span>© 2026 Luma Inc. All rights reserved.</span>
            <div className="flex gap-6">
              <a href="#" className="hover:text-[#999] transition-colors">
                Privacy
              </a>
              <a href="#" className="hover:text-[#999] transition-colors">
                Terms
              </a>
            </div>
          </div>
        </div>
      </footer>

      {/* ── Keyframes ────────────────────────── */}
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
