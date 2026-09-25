import type { Metadata, Viewport } from "next";
import { Alfa_Slab_One, Courier_Prime } from "next/font/google";
import "./globals.css";
import TicketRain from "./components/TicketRain";
import { ServiceWorkerRegister } from "./components/pwa";

// Direction artistique « Ticket rétro » : titres à gros empattements, texte façon machine à écrire
const slab = Alfa_Slab_One({
  variable: "--font-slab-one",
  subsets: ["latin"],
  weight: "400",
});

const type = Courier_Prime({
  variable: "--font-type",
  subsets: ["latin"],
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: "Lagrobarber · Prendre rendez-vous",
  description: "Réserve ta coupe en quelques secondes, confirmation immédiate.",
  applicationName: "Lagrobarber",
  // Aperçu quand le lien est partagé (messagerie, réseaux, CV en ligne)
  openGraph: {
    title: "Lagrobarber · Prendre rendez-vous",
    description: "Réserve ta coupe en quelques secondes : choisis un jour, une heure, c'est confirmé.",
    type: "website",
    locale: "fr_FR",
    images: [{ url: "/icons/icon-512.png", width: 512, height: 512, alt: "Lagrobarber" }],
  },
  // Réglages propres à l'iPhone quand l'app est lancée depuis l'écran d'accueil
  appleWebApp: {
    capable: true,
    title: "Lagrobarber",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0e1526",
  // Le contenu passe sous l'encoche et la barre d'accueil : les marges sont gérées avec env(safe-area-inset-*)
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body className={`${slab.variable} ${type.variable} antialiased`}>
        {/* Clavier : lien caché qui apparaît au premier Tab pour sauter directement au contenu */}
        <a href="#contenu" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[70] focus:px-4 focus:py-2 focus:bg-gold focus:text-navy focus:font-bold">
          Aller au contenu
        </a>
        <ServiceWorkerRegister />
        <TicketRain />
        {children}
      </body>
    </html>
  );
}
