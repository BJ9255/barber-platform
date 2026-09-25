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
  // Réglages propres à l'iPhone quand l'app est lancée depuis l'écran d'accueil
  appleWebApp: {
    capable: true,
    title: "Lagrobarber",
    statusBarStyle: "default",
  },
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#efe3cc",
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
        <ServiceWorkerRegister />
        <TicketRain />
        {children}
      </body>
    </html>
  );
}
