import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { SHOP_NAME } from './components/ui';

// Page introuvable : un ticket « hors service », avec un seul chemin pour repartir
export default function NotFound() {
    return (
        <main id="contenu" className="pad-top-screen pb-12 min-h-dvh max-w-md mx-auto px-5 flex flex-col justify-center">
            <div className="notched anim-pop bg-ticket px-7 py-8 text-center">
                <p className="text-xs font-bold uppercase tracking-[0.35em] text-red">Ticket introuvable</p>
                <p className="font-slab text-7xl mt-3 tabular-nums">404</p>
                <div className="my-5 border-t-2 border-dashed border-navy/40" />
                <p className="text-sm">Cette page n&apos;existe pas ou plus chez {SHOP_NAME}.</p>
            </div>
            <Link
                href="/"
                className="press font-slab mt-8 flex items-center justify-center gap-2 py-4 text-xl bg-red text-paper shadow-[4px_4px_0_rgba(4,8,20,.7)]"
            >
                Réserver une coupe <ArrowRight size={20} />
            </Link>
        </main>
    );
}
