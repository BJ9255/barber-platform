import Link from 'next/link';
import { ArrowRight, Scissors, Ticket } from 'lucide-react';
import { BarberPole, SHOP_NAME } from '../components/ui';

export const metadata = { title: `Démo · ${SHOP_NAME}` };

const SIDES = [
    {
        href: '/?demo',
        icon: Ticket,
        title: 'Côté client',
        text: 'Choisir un jour et une heure, donner son prénom, recevoir son ticket.',
    },
    {
        href: '/admin?demo',
        icon: Scissors,
        title: 'Côté coiffeur',
        text: 'Voir ses clients du jour, ouvrir des créneaux, gérer son planning.',
    },
];

// Page d'entrée de la démo : on choisit le point de vue, tout est fictif et rien n'est enregistré
export default function DemoPage() {
    return (
        <main className="safe-top min-h-dvh max-w-md mx-auto px-5 py-12 flex flex-col justify-center">
            <div className="anim-swing flex items-center gap-4">
                <BarberPole light />
                <div>
                    <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold">Démo · données fictives</p>
                    <h1 className="font-slab text-[40px] leading-none mt-1">{SHOP_NAME}</h1>
                </div>
            </div>
            <p className="mt-5 opacity-85">
                Essaie l&apos;application des deux côtés. Les créneaux et les clients sont inventés : rien n&apos;est envoyé ni enregistré.
            </p>

            <ul className="mt-8 space-y-4">
                {SIDES.map(({ href, icon: Icon, title, text }, i) => (
                    <li key={href}>
                        <Link
                            href={href}
                            className="notched press anim-dispense flex items-center gap-4 px-6 py-5 bg-ticket hover:bg-gold transition-colors"
                            style={{ animationDelay: `${150 + i * 120}ms` }}
                        >
                            <Icon size={28} className="text-red shrink-0" />
                            <span className="flex-1">
                                <span className="block font-slab text-2xl">{title}</span>
                                <span className="block text-sm mt-0.5">{text}</span>
                            </span>
                            <ArrowRight size={22} className="shrink-0" />
                        </Link>
                    </li>
                ))}
            </ul>

            <Link href="/" className="mt-10 text-sm text-center underline underline-offset-4 hover:text-gold">
                Revenir au vrai site
            </Link>
        </main>
    );
}
