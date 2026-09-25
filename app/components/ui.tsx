'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';
import { CheckCircle2, AlertCircle } from 'lucide-react';

export const SHOP_NAME = 'Lagrobarber';

// Poteau de barbier animé
export function BarberPole({ size = 'md' }: { size?: 'sm' | 'md' }) {
    const dims = size === 'md' ? 'w-4 h-14' : 'w-2.5 h-7';
    const cap = size === 'md' ? 'h-1.5 w-5' : 'h-1 w-3.5';

    return (
        <div className="flex flex-col items-center" aria-hidden>
            <div className={`${cap} rounded-full bg-brass`} />
            <div
                className={`${dims} rounded-sm overflow-hidden animate-pole ring-1 ring-black/40`}
                style={{
                    backgroundImage:
                        'repeating-linear-gradient(-45deg, #f3ede4 0 10px, #b8322a 10px 20px, #f3ede4 20px 30px, #1f3f7a 30px 40px)',
                    backgroundSize: '100% 56px',
                }}
            />
            <div className={`${cap} rounded-full bg-brass`} />
        </div>
    );
}

export function Logo({ onClick }: { onClick?: () => void }) {
    return (
        <Link href="/" onClick={onClick} className="flex items-center gap-3 group">
            <BarberPole size="sm" />
            <span className="font-display text-xl tracking-tight group-hover:text-brass-light transition-colors">
                {SHOP_NAME}
            </span>
        </Link>
    );
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
                    className="animate-sheet-up flex items-center gap-3 rounded-xl border border-line bg-surface-2/95 backdrop-blur px-4 py-3 shadow-2xl text-sm"
                >
                    {t.type === 'success'
                        ? <CheckCircle2 size={18} className="text-sage shrink-0" />
                        : <AlertCircle size={18} className="text-rust shrink-0" />}
                    {t.message}
                </div>
            ))}
        </div>
    );

    return { notify, toasts: node };
}
