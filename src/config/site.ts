export const siteConfig = {
  name: "OurLens",
  tagline: "Satu Acara. Ratusan Perspektif.",
  description:
    "Jadikan setiap tamu sebagai pencerita dan kumpulkan momen yang mungkin terlewatkan kameramu.",
  url: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
};

export const navLinks = [
  { href: "/how-it-works", label: "Cara kerja" },
  { href: "/pricing", label: "Harga" },
  { href: "/about", label: "Tentang" },
  { href: "/faq", label: "FAQ" },
  { href: "/partner/apply", label: "Kemitraan EO" },
] as const;
