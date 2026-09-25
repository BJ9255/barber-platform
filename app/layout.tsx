import type { Metadata, Viewport } from "next";
import { Geist, Fraunces } from "next/font/google";
import "./globals.css";
import Starfield from "./components/Starfield";
import { ServiceWorkerRegister } from "./components/pwa";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "Lagrobarber · Prendre rendez-vous",
  description: "Réserve ta coupe en quelques secondes, confirmation immédiate.",
  applicationName: "Lagrobarber",
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
  themeColor: "#0f0d0b",
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
      <body className={`${geistSans.variable} ${fraunces.variable} antialiased`}>
        <ServiceWorkerRegister />
        <Starfield />
        {children}
      </body>
    </html>
  );
}
