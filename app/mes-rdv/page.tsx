'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { format, formatDistanceToNow, isToday, isTomorrow } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
    ArrowLeft, ArrowRight, Bell, BellRing, CalendarPlus, Loader2, Scissors, Smartphone, Trash2, X,
} from 'lucide-react';
import { Logo, useToasts } from '../components/ui';
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
                forget(booking.token);
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
        <div className="min-h-screen bg-atmosphere">
            <header className="safe-top sticky top-0 z-40 border-b border-line/60 bg-ink/75 backdrop-blur-md">
                <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
                    <Logo />
                    <Link href="/" className="flex items-center gap-2 text-sm text-muted hover:text-cream px-3 py-2 rounded-full hover:bg-surface-2 transition">
                        <ArrowLeft size={15} /> Réserver
                    </Link>
                </div>
            </header>

            <main className="max-w-xl mx-auto px-4 sm:px-6 py-10 sm:py-14 pb-24">
                <p className="animate-fade-up text-brass text-sm tracking-[0.2em] uppercase">Sans compte</p>
                <h1 className="animate-fade-up font-display text-4xl sm:text-5xl mt-2" style={{ animationDelay: '80ms' }}>
                    Mes rendez-vous
                </h1>
                <p className="animate-fade-up text-muted mt-3 flex items-start gap-2 text-sm" style={{ animationDelay: '160ms' }}>
                    <Smartphone size={16} className="shrink-0 mt-0.5" />
                    Tes réservations sont gardées sur ce téléphone, rien à retenir.
                </p>

                <div className="mt-10 space-y-3">
                    {bookings === undefined ? (
                        Array.from({ length: 2 }).map((_, i) => <div key={i} className="skeleton animate-shimmer h-40 rounded-2xl" />)
                    ) : upcoming.length === 0 ? (
                        <div className="animate-fade-in rounded-2xl border border-line bg-surface/45 p-10 text-center">
                            <div className="size-14 rounded-full bg-surface-2 grid place-items-center mx-auto mb-4">
                                <Scissors size={22} className="text-muted" />
                            </div>
                            <p className="font-medium">Aucun rendez-vous à venir</p>
                            <p className="text-sm text-muted mt-1">Réserve ton prochain créneau en quelques secondes.</p>
                            <Link
                                href="/#reserver"
                                className="group mt-6 inline-flex items-center gap-2 rounded-full bg-brass text-ink font-semibold px-6 py-3 hover:bg-brass-light transition"
                            >
                                Prendre rendez-vous
                                <ArrowRight size={17} className="transition-transform group-hover:translate-x-1" />
                            </Link>
                        </div>
                    ) : (
                        upcoming.map((b, i) => {
                            const date = new Date(b.startTime);
                            const armed = armedCancel === b.token;
                            const loading = busy === b.token;
                            if (b.status === 'cancelled') {
                                return (
                                    <div key={b.token} className="animate-fade-up rounded-2xl border border-rust/30 bg-rust/5 p-5 flex items-center gap-4" style={{ animationDelay: `${i * 70}ms` }}>
                                        <div className="flex-1">
                                            <p className="text-xs text-rust uppercase tracking-wider">Annulé par le salon</p>
                                            <p className="mt-1 first-letter:uppercase">{dayLabel(date)} · {format(date, 'HH:mm')}</p>
                                        </div>
                                        <button onClick={() => forget(b.token)} aria-label="Retirer" className="p-2 text-muted hover:text-cream transition">
                                            <X size={18} />
                                        </button>
                                    </div>
                                );
                            }
                            return (
                                <div
                                    key={b.token}
                                    className="animate-fade-up rounded-2xl border border-brass/30 bg-gradient-to-br from-brass/10 to-surface/80 p-6"
                                    style={{ animationDelay: `${i * 70}ms` }}
                                >
                                    <div className="flex items-start justify-between gap-4">
                                        <div>
                                            <p className="text-sm text-muted first-letter:uppercase">{dayLabel(date)}</p>
                                            <p className="font-display text-4xl tabular-nums mt-1">{format(date, 'HH:mm')}</p>
                                        </div>
                                        <span className="shrink-0 text-xs rounded-full bg-brass/15 text-brass-light px-3 py-1">
                                            {formatDistanceToNow(date, { addSuffix: true, locale: fr })}
                                        </span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 mt-6 text-sm">
                                        <a
                                            href={`/api/calendar/${b.slotId}`}
                                            className="flex items-center justify-center gap-2 rounded-xl border border-line bg-ink/40 py-2.5 hover:border-brass transition"
                                        >
                                            <CalendarPlus size={16} className="text-brass" /> Calendrier
                                        </a>
                                        <button
                                            onClick={() => enableReminder(b)}
                                            disabled={b.reminder || loading}
                                            className="flex items-center justify-center gap-2 rounded-xl border border-line bg-ink/40 py-2.5 hover:border-brass transition disabled:hover:border-line"
                                        >
                                            {b.reminder
                                                ? <><BellRing size={16} className="text-sage" /> Rappel activé</>
                                                : <><Bell size={16} className="text-brass" /> Me rappeler</>}
                                        </button>
                                    </div>
                                    <button
                                        onClick={() => cancel(b)}
                                        disabled={loading}
                                        className={`mt-2 w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm transition ${armed
                                            ? 'bg-rust text-ink font-medium'
                                            : 'text-muted hover:text-rust hover:bg-rust/10'
                                            }`}
                                    >
                                        {loading ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={15} />}
                                        {armed ? "Confirmer l'annulation" : 'Annuler le rendez-vous'}
                                    </button>
                                </div>
                            );
                        })
                    )}
                </div>

                {past.length > 0 && (
                    <section className="mt-12">
                        <h2 className="text-sm text-muted uppercase tracking-wider mb-3">Passés</h2>
                        <ul className="rounded-2xl border border-line bg-surface/45 divide-y divide-line">
                            {past.map(b => (
                                <li key={b.token} className="px-5 py-3.5 flex items-center justify-between text-sm">
                                    <span className="first-letter:uppercase">{format(new Date(b.startTime), 'EEEE d MMMM', { locale: fr })}</span>
                                    <span className="text-muted tabular-nums">{format(new Date(b.startTime), 'HH:mm')}</span>
                                </li>
                            ))}
                        </ul>
                    </section>
                )}
            </main>
            {toasts}
        </div>
    );
}
