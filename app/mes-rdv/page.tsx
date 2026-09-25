'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { format, formatDistanceToNow, isToday, isTomorrow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ArrowLeft, ArrowRight, Bell, BellRing, CalendarPlus, Loader2, Smartphone, Trash2, X } from 'lucide-react';
import { BarberPole, Logo, Reveal, SHOP_NAME, useToasts } from '../components/ui';
import { warp } from '../components/TicketRain';
import {
    getPushSubscription, getSavedBookings, pushErrorMessage, setSavedBookings, updateSavedBooking,
    type PushError, type SavedBooking,
} from '../components/pwa';

type Booking = SavedBooking & {
    // 'cancelled' : le RDV n'existe plus côté serveur (le salon a supprimé le créneau)
    status: 'upcoming' | 'past' | 'cancelled';
};

// Les RDV passés depuis plus d'un mois sont oubliés
const FORGET_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

const dayLabel = (d: Date) => {
    if (isToday(d)) return "Aujourd'hui";
    if (isTomorrow(d)) return 'Demain';
    return format(d, 'EEEE d MMMM', { locale: fr });
};

export default function MyBookingsPage() {
    const [bookings, setBookings] = useState<Booking[] | undefined>(undefined);
    const [armedCancel, setArmedCancel] = useState<string | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const [tearing, setTearing] = useState<string | null>(null);
    const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const { notify, toasts } = useToasts();

    const load = useCallback(async () => {
        const now = Date.now();
        const saved = getSavedBookings().filter(b => now - new Date(b.startTime).getTime() < FORGET_AFTER_MS);
        setSavedBookings(saved);
        if (saved.length === 0) return setBookings([]);

        try {
            const res = await fetch('/api/my-bookings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tokens: saved.map(b => b.token) }),
            });
            if (!res.ok) throw new Error();
            const live: { token: string; startTime: string }[] = await res.json();
            const liveByToken = new Map(live.map(b => [b.token, b]));

            setBookings(saved
                .map(b => {
                    const found = liveByToken.get(b.token);
                    const startTime = found?.startTime ?? b.startTime;
                    const status: Booking['status'] = !found
                        ? new Date(b.startTime).getTime() > now ? 'cancelled' : 'past'
                        : new Date(startTime).getTime() > now ? 'upcoming' : 'past';
                    return { ...b, startTime, status };
                })
                .sort((a, b) => a.startTime.localeCompare(b.startTime)));
        } catch {
            notify('Impossible de charger tes rendez-vous', 'error');
            setBookings([]);
        }
    }, [notify]);

    useEffect(() => { load(); }, [load]);

    const forget = (token: string) => {
        setSavedBookings(getSavedBookings().filter(b => b.token !== token));
        setBookings(prev => prev?.filter(b => b.token !== token));
    };

    // Le ticket se déchire, puis disparaît de la liste
    const tearOff = (token: string) => {
        setTearing(token);
        setTimeout(() => {
            forget(token);
            setTearing(null);
        }, 450);
    };

    // Annulation en deux appuis, comme la suppression côté coiffeur
    const cancel = async (booking: Booking) => {
        if (armedCancel !== booking.token) {
            setArmedCancel(booking.token);
            if (armTimer.current) clearTimeout(armTimer.current);
            armTimer.current = setTimeout(() => setArmedCancel(null), 3000);
            return;
        }
        setArmedCancel(null);
        setBusy(booking.token);
        try {
            const res = await fetch('/api/my-bookings', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: booking.token }),
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok || res.status === 404) {
                tearOff(booking.token);
                notify('Rendez-vous annulé, le créneau est libéré');
            } else {
                notify(data.error || "Impossible d'annuler", 'error');
                load();
            }
        } catch {
            notify('Erreur réseau, réessaie.', 'error');
        } finally {
            setBusy(null);
        }
    };

    const enableReminder = async (booking: Booking) => {
        setBusy(booking.token);
        try {
            const subscription = await getPushSubscription();
            const res = await fetch('/api/push/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ subscription, token: booking.token }),
            });
            if (!res.ok) throw new Error();
            updateSavedBooking(booking.token, { reminder: true });
            setBookings(prev => prev?.map(b => (b.token === booking.token ? { ...b, reminder: true } : b)));
            notify('Tu recevras un rappel le jour J');
        } catch (error) {
            notify(pushErrorMessage[error as PushError] ?? "Impossible d'activer le rappel", 'error');
        } finally {
            setBusy(null);
        }
    };

    const upcoming = bookings?.filter(b => b.status !== 'past') ?? [];
    const past = bookings?.filter(b => b.status === 'past').reverse() ?? [];

    return (
        <div className="min-h-dvh overflow-x-clip">
            <header className="safe-top sticky top-0 z-40 bg-navy text-paper">
                <div className="max-w-xl mx-auto px-5 h-14 flex items-center justify-between">
                    <Logo light />
                    <Link href="/" onClick={() => warp(0.5)} className="flex items-center gap-2 text-sm font-bold min-h-10 px-2 hover:text-gold transition">
                        <ArrowLeft size={16} /> Réserver
                    </Link>
                </div>
            </header>

            <main className="max-w-xl mx-auto px-5 py-10 pb-24">
                <div className="anim-swing flex items-center gap-4">
                    <BarberPole light />
                    <div>
                        <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold">Sans compte</p>
                        <h1 className="font-slab text-[32px] sm:text-5xl leading-none mt-1 whitespace-nowrap">Mes rendez-vous</h1>
                        <p className="text-sm mt-2 flex items-center gap-2"><Smartphone size={15} className="shrink-0" /> Tes tickets sont gardés sur ce téléphone.</p>
                    </div>
                </div>

                <div className="mt-10 space-y-5">
                    {bookings === undefined ? (
                        Array.from({ length: 2 }).map((_, i) => <div key={i} className="skeleton animate-shimmer h-56" />)
                    ) : upcoming.length === 0 ? (
                        <div className="anim-pop card-hard p-10 text-center">
                            <p className="font-slab text-2xl">Aucun ticket en cours</p>
                            <p className="text-sm mt-2">Réserve ton prochain créneau en quelques secondes.</p>
                            <Link
                                href="/"
                                onClick={() => warp(0.8)}
                                className="press font-slab mt-6 inline-flex items-center gap-2 px-6 py-3 text-lg bg-red text-paper shadow-[4px_4px_0_#1c2b4a]"
                            >
                                Prendre un ticket <ArrowRight size={18} />
                            </Link>
                        </div>
                    ) : (
                        upcoming.map((b, i) => {
                            const date = new Date(b.startTime);
                            const armed = armedCancel === b.token;
                            const loading = busy === b.token;
                            const torn = tearing === b.token ? 'anim-tear' : '';

                            if (b.status === 'cancelled') {
                                return (
                                    <Reveal key={b.token} delay={i * 80}>
                                        <div className={`notched ${torn} flex items-center gap-4 px-6 py-4 bg-ticket opacity-80`}>
                                            <div className="flex-1">
                                                <p className="text-xs font-bold uppercase tracking-[0.25em] text-red">Annulé par le salon</p>
                                                <p className="mt-1 font-bold first-letter:uppercase line-through">{dayLabel(date)} · {format(date, 'HH:mm')}</p>
                                            </div>
                                            <button onClick={() => tearOff(b.token)} aria-label="Retirer" className="size-10 grid place-items-center hover:text-red transition">
                                                <X size={18} />
                                            </button>
                                        </div>
                                    </Reveal>
                                );
                            }

                            return (
                                <Reveal key={b.token} delay={i * 80}>
                                    <div className={`${torn}`}>
                                        <div className="notched px-6 py-6 bg-ticket shadow-[0_12px_30px_-14px_rgba(28,43,74,.45)]">
                                            <p className="text-xs font-bold uppercase tracking-[0.3em] text-red">Ticket de passage</p>
                                            <p className="font-slab text-5xl mt-3">{format(date, 'HH:mm')}</p>
                                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                                <p className="font-bold text-lg first-letter:uppercase">{dayLabel(date)}</p>
                                                <span className="text-xs font-bold px-2 py-0.5 border-2 border-navy">
                                                    {formatDistanceToNow(date, { addSuffix: true, locale: fr })}
                                                </span>
                                            </div>
                                            <div className="my-4 border-t-2 border-dashed border-navy/40" />
                                            <div className="flex justify-between text-sm"><span>Chez</span><strong>{SHOP_NAME}</strong></div>

                                            <div className="grid grid-cols-2 gap-2 mt-5 text-sm">
                                                <a
                                                    href={`/api/calendar/${b.slotId}`}
                                                    target="_blank"
                                                    rel="noopener"
                                                    className="card-hard press flex items-center justify-center gap-2 py-2.5 font-bold"
                                                >
                                                    <CalendarPlus size={16} className="text-red" /> Calendrier
                                                </a>
                                                <button
                                                    onClick={() => enableReminder(b)}
                                                    disabled={b.reminder || loading}
                                                    className="card-hard press flex items-center justify-center gap-2 py-2.5 font-bold"
                                                >
                                                    {b.reminder
                                                        ? <><BellRing size={16} className="text-ok" /> Rappel activé</>
                                                        : <><Bell size={16} className="text-red" /> Me rappeler</>}
                                                </button>
                                            </div>
                                            <button
                                                onClick={() => cancel(b)}
                                                disabled={loading}
                                                className={`mt-3 w-full flex items-center justify-center gap-2 py-2.5 text-sm font-bold transition ${armed
                                                    ? 'bg-red text-paper'
                                                    : 'hover:text-red hover:bg-red/10'
                                                    }`}
                                            >
                                                {loading ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={15} />}
                                                {armed ? "Confirmer l'annulation" : 'Annuler le rendez-vous'}
                                            </button>
                                        </div>
                                    </div>
                                </Reveal>
                            );
                        })
                    )}
                </div>

                {past.length > 0 && (
                    <section className="mt-14">
                        <Reveal>
                            <h2 className="text-sm font-bold uppercase tracking-[0.25em]">Tickets passés</h2>
                        </Reveal>
                        <Reveal delay={100}>
                            <ul className="card-hard mt-3 divide-y-2 divide-dashed divide-navy/20">
                                {past.map(b => (
                                    <li key={b.token} className="px-5 py-3 flex items-center justify-between text-sm">
                                        <span className="first-letter:uppercase">{format(new Date(b.startTime), 'EEEE d MMMM', { locale: fr })}</span>
                                        <span className="font-slab tabular-nums">{format(new Date(b.startTime), 'HH:mm')}</span>
                                    </li>
                                ))}
                            </ul>
                        </Reveal>
                    </section>
                )}
            </main>
            {toasts}
        </div>
    );
}
