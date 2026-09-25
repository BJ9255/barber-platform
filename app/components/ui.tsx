'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, AlertCircle } from 'lucide-react';

export const SHOP_NAME = 'Lagrobarber';
export const SERVICES = 'Coupe · Dégradé · Barbe';

// Poteau de barbier : rayures rouge / blanc / bleu qui tournent en continu.
// Le motif est répété deux fois dans la tuile, ce qui rend le raccord invisible pendant la rotation.
export function BarberPole({ size = 'md', light = false }: { size?: 'sm' | 'md' | 'lg'; light?: boolean }) {
    const dims = { sm: 'w-2 h-7', md: 'w-3.5 h-20', lg: 'w-3.5 h-20 lg:w-5 lg:h-36' }[size];
    return (
        <div
            aria-hidden
            className={`anim-pole shrink-0 rounded-full overflow-hidden ${dims}`}
            style={{
                border: `2px solid ${light ? '#efe3cc' : '#1c2b4a'}`,
                background: 'linear-gradient(-45deg, #b3261e 0 12.5%, #fffaf0 0 25%, #1c2b4a 0 37.5%, #fffaf0 0 50%, #b3261e 0 62.5%, #fffaf0 0 75%, #1c2b4a 0 87.5%, #fffaf0 0)',
                backgroundSize: '48px 48px',
            }}
        />
    );
}

// Logo compact : petit poteau + nom, pour les en-têtes
export function Logo({ light = false }: { light?: boolean }) {
    return (
        <Link href="/" className="flex items-center gap-2.5 py-2 min-h-10 group">
            <BarberPole size="sm" light={light} />
            <span className="font-slab text-xl leading-none group-hover:text-red transition-colors">{SHOP_NAME}</span>
        </Link>
    );
}

// Ajoute « is-visible » quand l'élément entre dans l'écran (une seule fois) : voir .reveal dans globals.css
export function Reveal({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const io = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting) {
                el.classList.add('is-visible');
                io.disconnect();
            }
        }, { rootMargin: '0px 0px -40px 0px' });
        io.observe(el);
        return () => io.disconnect();
    }, []);
    return <div ref={ref} className={`reveal ${className}`} style={{ transitionDelay: `${delay}ms` }}>{children}</div>;
}

// Notifications légères qui remplacent les alert()
type Toast = { id: number; message: string; type: 'success' | 'error' };

export function useToasts() {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const notify = useCallback((message: string, type: Toast['type'] = 'success') => {
        const id = Date.now() + Math.random();
        setToasts(t => [...t, { id, message, type }]);
        setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500);
    }, []);

    const node = (
        <div style={{ bottom: 'calc(1rem + env(safe-area-inset-bottom))' }} className="fixed left-1/2 -translate-x-1/2 z-[60] flex flex-col gap-2 w-[calc(100%-2rem)] max-w-sm pointer-events-none">
            {toasts.map(t => (
                <div
                    key={t.id}
                    role="status"
                    className="animate-sheet-up flex items-center gap-3 px-4 py-3 text-sm font-bold bg-ticket border-2 border-navy shadow-[4px_4px_0_#1c2b4a]"
                >
                    {t.type === 'success'
                        ? <CheckCircle2 size={18} className="text-ok shrink-0" />
                        : <AlertCircle size={18} className="text-red shrink-0" />}
                    {t.message}
                </div>
            ))}
        </div>
    );

    return { notify, toasts: node };
}
