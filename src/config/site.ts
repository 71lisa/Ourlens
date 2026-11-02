export const siteConfig = {
  name: "OurLens",
  tagline: "One Event. Hundreds of Perspectives.",
  description:
    "Turn every guest into a storyteller and collect the moments your camera might miss.",
  url: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
};

export const navLinks = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/pricing", label: "Pricing" },
  { href: "/about", label: "About" },
  { href: "/faq", label: "FAQ" },
] as const;
