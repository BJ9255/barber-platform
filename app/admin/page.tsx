'use client';

import Link from 'next/link';
import { useState, useEffect, useCallback, useRef } from 'react';
import { addDays, format, isSameDay, isToday, isTomorrow, formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
    Trash2, Plus, Loader2, Phone, Mail, Eye, EyeOff, ArrowLeft, LogOut, ExternalLink,
    RefreshCw, CalendarCheck, CalendarPlus, Sun, UserRound, Clock, Check, Sparkles, Bell, BellRing,
    ChevronLeft, ChevronRight, CalendarDays, Settings,
} from 'lucide-react';
import { BarberPole, Logo, Reveal, useToasts } from '../components/ui';
import { generateDemoSlots } from './demo';
import { warp } from '../components/TicketRain';
import { getExistingPushEndpoint, getPushSubscription, pushErrorMessage, type PushError } from '../components/pwa';

type Slot = {
    id: string;
    startTime: string;
    isBooked: boolean;
    clientName?: string | null;
    clientPhone?: string | null;
    clientEmail?: string | null;
};

type Filter = 'all' | 'booked' | 'free';
// Téléphone : l'espace coiffeur est découpé en onglets pour ne pas tout empiler
type Tab = 'planning' | 'ouvrir' | 'reglages';

// Sur téléphone, on n'ouvre pas le clavier d'office à l'arrivée sur la page
const canAutoFocus = typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches;

// Heures proposées en un clic lors de l'ajout de créneaux
const PRESET_TIMES = Array.from({ length: 22 }, (_, i) => {
    const minutes = 9 * 60 + i * 30;
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
});

const dayLabel = (d: Date) => {
    if (isToday(d)) return "Aujourd'hui";
    if (isTomorrow(d)) return 'Demain';
    return format(d, 'EEEE d MMMM', { locale: fr });
};

export default function AdminPage() {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [checkingSession, setCheckingSession] = useState(true);
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loginError, setLoginError] = useState('');
    const [loggingIn, setLoggingIn] = useState(false);
    const [demo, setDemo] = useState(false);
    const demoRef = useRef(false);

    const [slots, setSlots] = useState<Slot[]>([]);
    const [loading, setLoading] = useState(false);
    const [filter, setFilter] = useState<Filter>('all');
    const [tab, setTab] = useState<Tab>('planning');
    // Sur ordinateur tout reste visible ; sur téléphone, seul l'onglet choisi s'affiche
    const onTab = (t: Tab) => (tab === t ? '' : 'hidden lg:block');
    const [armedDelete, setArmedDelete] = useState<string | null>(null);
    const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Jour affiché dans le planning, et jour où l'on ouvre des créneaux (les deux restent synchronisés)
    const [newDate, setNewDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [selectedTimes, setSelectedTimes] = useState<string[]>([]);
    const [customTime, setCustomTime] = useState('');
    const [adding, setAdding] = useState(false);

    // Notifications de réservation sur le téléphone du coiffeur
    const [pushState, setPushState] = useState<'off' | 'loading' | 'on'>('off');

    const { notify, toasts } = useToasts();

    useEffect(() => {
        getExistingPushEndpoint().then(endpoint => { if (endpoint) setPushState('on'); }).catch(() => {});
    }, []);

    const togglePush = async () => {
        if (demo) return notify('Les notifications ne sont pas disponibles en démo', 'error');
        setPushState('loading');
        try {
            if (pushState === 'on') {
                const endpoint = await getExistingPushEndpoint();
                const res = await fetch('/api/admin/push', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ endpoint }),
                });
                if (handleUnauthorized(res)) return;
                setPushState('off');
                notify('Notifications désactivées sur ce téléphone');
                return;
            }
            const subscription = await getPushSubscription();
            const res = await fetch('/api/admin/push', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ subscription }),
            });
            if (handleUnauthorized(res)) return;
            if (!res.ok) throw new Error();
            setPushState('on');
        } catch (error) {
            setPushState(prev => (prev === 'loading' ? 'off' : prev));
            notify(pushErrorMessage[error as PushError] ?? "Impossible d'activer les notifications", 'error');
        }
    };

    // Session expirée pendant l'utilisation : retour à l'écran de connexion
    const handleUnauthorized = useCallback((res: Response) => {
        if (res.status === 401) {
            setIsAuthenticated(false);
            notify('Session expirée, reconnecte-toi.', 'error');
            return true;
        }
        return false;
    }, [notify]);

    const fetchSlots = useCallback(async () => {
        if (demoRef.current) return;
        setLoading(true);
        try {
            const res = await fetch('/api/admin/slots', { cache: 'no-store' });
            if (handleUnauthorized(res)) return;
            if (res.ok) setSlots(await res.json());
            else notify('Impossible de charger les créneaux', 'error');
        } catch (error) {
            console.error('Failed to fetch', error);
            notify('Erreur réseau', 'error');
        } finally {
            setLoading(false);
        }
    }, [handleUnauthorized, notify]);

    const startDemo = () => {
        warp();
        demoRef.current = true;
        setDemo(true);
        setSlots(generateDemoSlots());
        setIsAuthenticated(true);
        setCheckingSession(false);
        window.history.replaceState(null, '', '/admin?demo');
    };

    const exitDemo = () => {
        demoRef.current = false;
        setDemo(false);
        setIsAuthenticated(false);
        setSlots([]);
        window.history.replaceState(null, '', '/admin');
    };

    useEffect(() => {
        // Lien direct vers la démo : /admin?demo
        if (new URLSearchParams(window.location.search).has('demo')) {
            startDemo();
            return;
        }
        // La session est un cookie httpOnly vérifié par le serveur
        fetch('/api/admin/session', { cache: 'no-store' })
            .then(res => res.json())
            .then(data => {
                if (data.authenticated) {
                    setIsAuthenticated(true);
                    fetchSlots();
                }
            })
            .catch(() => {})
            .finally(() => setCheckingSession(false));
    }, [fetchSlots]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoggingIn(true);
        setLoginError('');
        try {
            const res = await fetch('/api/admin/session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password }),
            });
            if (res.ok) {
                warp();
                setPassword('');
                setIsAuthenticated(true);
                fetchSlots();
            } else {
                setLoginError('Mot de passe incorrect');
            }
        } catch {
            setLoginError('Erreur réseau, réessaie.');
        } finally {
            setLoggingIn(false);
        }
    };

    const handleLogout = async () => {
        if (demo) return exitDemo();
        await fetch('/api/admin/session', { method: 'DELETE' });
        setIsAuthenticated(false);
        setSlots([]);
    };

    const toggleTime = (time: string) => {
        setSelectedTimes(prev =>
            prev.includes(time) ? prev.filter(t => t !== time) : [...prev, time].sort()
        );
    };

    const addCustomTime = () => {
        if (!customTime || selectedTimes.includes(customTime)) return;
        setSelectedTimes(prev => [...prev, customTime].sort());
        setCustomTime('');
    };

    const handleAddSlots = async () => {
        if (!newDate || selectedTimes.length === 0) return;
        if (demo) {
            const created = selectedTimes.map(time => ({
                id: `demo-new-${newDate}-${time}`,
                startTime: new Date(`${newDate}T${time}`).toISOString(),
                isBooked: false,
            }));
            setSlots(prev => [...prev, ...created].sort((a, b) => a.startTime.localeCompare(b.startTime)));
            notify(`${created.length} créneau${created.length > 1 ? 'x' : ''} ajouté${created.length > 1 ? 's' : ''} (démo)`);
            setTab('planning');
            setSelectedTimes([]);
            return;
        }
        setAdding(true);
        try {
            const results = await Promise.all(
                selectedTimes.map(time =>
                    fetch('/api/admin/slots', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ startTime: new Date(`${newDate}T${time}`) }),
                    })
                )
            );
            if (results.some(r => handleUnauthorized(r))) return;

            const ok = results.filter(r => r.ok).length;
            const failed = results.length - ok;
            if (ok > 0) {
                notify(`${ok} créneau${ok > 1 ? 'x' : ''} ajouté${ok > 1 ? 's' : ''}`);
                setTab('planning');
            }
            if (failed > 0) notify(`${failed} créneau${failed > 1 ? 'x' : ''} en erreur`, 'error');
            setSelectedTimes([]);
            fetchSlots();
        } catch (error) {
            console.error(error);
            notify('Erreur réseau', 'error');
        } finally {
            setAdding(false);
        }
    };

    // Suppression en deux clics : le premier arme le bouton, le second confirme
    const handleDeleteSlot = async (slot: Slot) => {
        if (armedDelete !== slot.id) {
            setArmedDelete(slot.id);
            if (armTimer.current) clearTimeout(armTimer.current);
            armTimer.current = setTimeout(() => setArmedDelete(null), 3000);
            return;
        }
        setArmedDelete(null);

        if (demo) {
            setSlots(prev => prev.filter(s => s.id !== slot.id));
            notify('Créneau supprimé (démo)');
            return;
        }

        const res = await fetch(`/api/admin/slots?id=${encodeURIComponent(slot.id)}`, { method: 'DELETE' });
        if (handleUnauthorized(res)) return;
        if (res.ok) {
            setSlots(prev => prev.filter(s => s.id !== slot.id));
            notify(slot.isBooked ? `Supprimé. Pense à prévenir ${slot.clientName}.` : 'Créneau supprimé');
        } else {
            notify('Impossible de supprimer ce créneau', 'error');
        }
    };

    if (checkingSession) {
        return (
            <div className="min-h-dvh grid place-items-center">
                <Loader2 className="animate-spin text-red" size={28} />
            </div>
        );
    }

    if (!isAuthenticated) {
        return (
            <div className="pad-top-screen min-h-dvh flex flex-col items-center justify-center px-5 pb-5">
                <form onSubmit={handleLogin} className="anim-pop card-hard w-full max-w-sm p-8 shadow-[6px_6px_0_#1c2b4a]">
                    <div className="anim-swing flex items-center justify-center gap-4">
                        <BarberPole />
                        <div className="text-center">
                            <p className="text-xs font-bold uppercase tracking-[0.3em] text-red">Réservé au salon</p>
                            <h1 className="font-slab text-3xl leading-none mt-1">Espace coiffeur</h1>
                        </div>
                        <BarberPole />
                    </div>
                    <p className="text-sm text-center mt-4">Gère tes créneaux et tes clients.</p>

                    <div key={loginError} className={`relative mt-7 ${loginError ? 'animate-shake' : ''}`}>
                        <input
                            type={showPassword ? 'text' : 'password'}
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            placeholder="Mot de passe"
                            aria-label="Mot de passe"
                            autoComplete="current-password"
                            autoFocus={canAutoFocus}
                            enterKeyHint="go"
                            className={`w-full px-4 pr-12 py-3 text-lg bg-ticket border-2 outline-none transition-shadow placeholder:text-muted/70 ${loginError ? 'border-red focus:shadow-[4px_4px_0_#b3261e]' : 'border-navy focus:shadow-[4px_4px_0_#b3261e]'}`}
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword(v => !v)}
                            aria-label={showPassword ? 'Masquer' : 'Afficher'}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-2.5 hover:text-red transition"
                        >
                            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                    </div>
                    {loginError && <p className="text-red text-sm font-bold mt-2">{loginError}</p>}

                    <button
                        type="submit"
                        disabled={!password || loggingIn}
                        className="press font-slab mt-5 w-full py-3 text-xl bg-red text-paper shadow-[4px_4px_0_#1c2b4a] flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        {loggingIn && <Loader2 className="animate-spin" size={18} />}
                        Entrer
                    </button>

                    <div className="flex items-center gap-3 my-5 text-xs">
                        <span className="h-0 flex-1 border-t-2 border-dashed border-navy/30" /> ou <span className="h-0 flex-1 border-t-2 border-dashed border-navy/30" />
                    </div>
                    <button
                        type="button"
                        onClick={startDemo}
                        className="notched press w-full py-3 bg-navy text-paper font-bold flex items-center justify-center gap-2"
                    >
                        <Sparkles size={17} className="text-gold" />
                        Voir la démo
                    </button>
                    <p className="text-xs text-center mt-2">Données fictives, rien n&apos;est enregistré.</p>
                </form>
                <Link href="/" className="mt-5 py-2 flex items-center gap-2 text-sm font-bold hover:text-red transition">
                    <ArrowLeft size={15} /> Retour au site
                </Link>
                {toasts}
            </div>
        );
    }

    const now = new Date();
    const upcoming = slots.filter(s => new Date(s.startTime) > now);
    const bookedUpcoming = upcoming.filter(s => s.isBooked);
    const freeUpcoming = upcoming.filter(s => !s.isBooked);
    const bookedToday = slots.filter(s => s.isBooked && isToday(new Date(s.startTime)));
    const nextBooking = bookedUpcoming[0];

    const takenTimes = new Set(
        slots
            .filter(s => format(new Date(s.startTime), 'yyyy-MM-dd') === newDate)
            .map(s => format(new Date(s.startTime), 'HH:mm'))
    );
    const isPastTime = (time: string) => new Date(`${newDate}T${time}`) <= now;
    const customTimes = selectedTimes.filter(t => !PRESET_TIMES.includes(t));

    const selectedDay = new Date(`${newDate}T12:00`);
    const todayKey = format(now, 'yyyy-MM-dd');
    const changeDay = (key: string) => { setNewDate(key); setSelectedTimes([]); };
    const shiftDay = (delta: number) => changeDay(format(addDays(selectedDay, delta), 'yyyy-MM-dd'));
    // Prochain / précédent jour qui a des créneaux, pour sauter les jours vides
    const dayKeys = [...new Set(slots.map(s => format(new Date(s.startTime), 'yyyy-MM-dd')))].sort();
    const nextKey = dayKeys.find(k => k > newDate);
    const prevKey = [...dayKeys].reverse().find(k => k < newDate && k >= todayKey);

    const daySlots = slots.filter(s => isSameDay(new Date(s.startTime), selectedDay));
    const filtered = daySlots.filter(s =>
        filter === 'booked' ? s.isBooked : filter === 'free' ? !s.isBooked : true
    );

    return (
        <div className="min-h-dvh">
            <header className="safe-top sticky top-0 z-40 bg-navy text-paper">
                <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
                    <Logo light />
                    <div className="flex items-center gap-1 sm:gap-2">
                        <a
                            href="/"
                            target="_blank"
                            aria-label="Voir le site"
                            className="min-h-10 min-w-10 justify-center flex items-center gap-2 text-sm font-bold px-3 py-2 hover:text-gold transition"
                        >
                            <ExternalLink size={15} />
                            <span className="hidden sm:inline">Voir le site</span>
                        </a>
                        <button
                            onClick={handleLogout}
                            aria-label={demo ? 'Quitter la démo' : 'Déconnexion'}
                            className="min-h-10 min-w-10 justify-center flex items-center gap-2 text-sm font-bold px-3 py-2 hover:text-gold transition"
                        >
                            <LogOut size={15} />
                            <span className="hidden sm:inline">{demo ? 'Quitter la démo' : 'Déconnexion'}</span>
                        </button>
                    </div>
                </div>
                {demo && (
                    <div className="bg-gold text-navy text-sm font-bold">
                        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-2 flex items-center justify-center gap-2 text-center">
                            <Sparkles size={15} className="shrink-0" />
                            Démo coiffeur : clients fictifs, rien n&apos;est enregistré.
                            <Link href="/demo" className="underline underline-offset-2 shrink-0">Changer</Link>
                        </div>
                    </div>
                )}
            </header>

            <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 pb-28 lg:py-14">
                <div className="flex flex-wrap items-end justify-between gap-4 mb-6 lg:mb-10">
                    <div className="anim-swing flex items-center gap-4">
                        <BarberPole light />
                        <div>
                            <p className="text-sm font-bold uppercase tracking-[0.25em] text-gold">
                                {format(now, 'EEEE d MMMM', { locale: fr })}
                            </p>
                            <h1 className="font-slab text-[32px] sm:text-5xl leading-none mt-1">
                                <span className="lg:hidden">{{ planning: 'Mon planning', ouvrir: 'Ouvrir des créneaux', reglages: 'Réglages' }[tab]}</span>
                                <span className="hidden lg:inline">Tableau de bord</span>
                            </h1>
                        </div>
                    </div>
                    <div className="hidden lg:flex flex-wrap gap-2">
                        <button
                            onClick={togglePush}
                            disabled={pushState === 'loading'}
                            className={`card-hard press flex items-center gap-2 text-sm font-bold px-4 py-2 ${pushState === 'on' ? 'text-ok' : ''}`}
                        >
                            {pushState === 'loading' ? <Loader2 size={15} className="animate-spin" />
                                : pushState === 'on' ? <BellRing size={15} /> : <Bell size={15} />}
                            {pushState === 'on' ? 'Notifications activées' : 'Activer les notifications'}
                        </button>
                        <button onClick={fetchSlots} className="card-hard press flex items-center gap-2 text-sm font-bold px-4 py-2">
                            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
                            Actualiser
                        </button>
                    </div>
                </div>

                {/* Statistiques : trois tickets */}
                <div className={`grid grid-cols-3 gap-2 sm:gap-4 mb-6 lg:mb-8 ${tab === 'planning' ? '' : 'hidden lg:grid'}`}>
                    {[
                        { icon: CalendarCheck, label: 'Réservations à venir', value: bookedUpcoming.length },
                        { icon: CalendarPlus, label: 'Créneaux libres', value: freeUpcoming.length },
                        { icon: Sun, label: "Clients aujourd'hui", value: bookedToday.length },
                    ].map(({ icon: Icon, label, value }, i) => (
                        <Reveal key={label} delay={i * 90}>
                            <div className="notched bg-navy text-paper h-full px-4 py-3 sm:px-6 sm:py-5 flex items-center gap-4">
                                <Icon size={22} className="hidden sm:block text-gold shrink-0" />
                                <div>
                                    <p className="font-slab text-3xl sm:text-4xl tabular-nums leading-none">{loading && slots.length === 0 ? '–' : value}</p>
                                    <p className="text-[11px] leading-tight sm:text-sm mt-1">{label}</p>
                                </div>
                            </div>
                        </Reveal>
                    ))}
                </div>

                <div className="grid lg:grid-cols-[1fr_1.15fr] gap-8 items-start">
                    <div className="space-y-6 lg:space-y-8 lg:sticky lg:top-24">
                        {/* Prochain client : un ticket de passage */}
                        <Reveal className={onTab('planning')}>
                            <section className="notched bg-ticket px-6 py-6 shadow-[0_12px_30px_-14px_rgba(28,43,74,.45)]">
                                <p className="text-xs font-bold uppercase tracking-[0.3em] text-red">Prochain client</p>
                                {nextBooking ? (
                                    <>
                                        <div className="flex items-start justify-between gap-4 mt-3">
                                            <div>
                                                <p className="font-slab text-3xl">{nextBooking.clientName}</p>
                                                <p className="font-bold mt-1 first-letter:uppercase">
                                                    {dayLabel(new Date(nextBooking.startTime))} · {format(new Date(nextBooking.startTime), 'HH:mm')}
                                                </p>
                                            </div>
                                            <span className="shrink-0 text-xs font-bold px-2 py-0.5 border-2 border-navy">
                                                {formatDistanceToNow(new Date(nextBooking.startTime), { addSuffix: true, locale: fr })}
                                            </span>
                                        </div>
                                        <div className="my-4 border-t-2 border-dashed border-navy/40" />
                                        <div className="flex flex-wrap gap-2">
                                            {nextBooking.clientPhone && (
                                                <a
                                                    href={`tel:${nextBooking.clientPhone}`}
                                                    className="press flex items-center gap-2 bg-red text-paper text-sm font-bold px-4 py-2.5 shadow-[3px_3px_0_#1c2b4a]"
                                                >
                                                    <Phone size={15} /> {nextBooking.clientPhone}
                                                </a>
                                            )}
                                            {nextBooking.clientEmail && (
                                                <a href={`mailto:${nextBooking.clientEmail}`} className="card-hard press flex items-center gap-2 text-sm font-bold px-4 py-2">
                                                    <Mail size={15} /> Email
                                                </a>
                                            )}
                                        </div>
                                    </>
                                ) : (
                                    <p className="mt-3">Aucune réservation à venir pour l&apos;instant.</p>
                                )}
                            </section>
                        </Reveal>

                        {/* Ajouter des créneaux */}
                        <Reveal delay={100} className={onTab('ouvrir')}>
                            <section className="card-hard p-6">
                                <h2 className="hidden lg:flex font-slab text-2xl items-center gap-2">
                                    <Plus size={22} className="text-red" /> Ouvrir des créneaux
                                </h2>
                                <p className="text-sm lg:mt-1">Choisis un jour, puis toutes les heures à ouvrir.</p>

                                <div className="mt-5">
                                    <DayStepper
                                        day={selectedDay}
                                        onPrev={() => shiftDay(-1)}
                                        onNext={() => shiftDay(1)}
                                        prevDisabled={newDate <= todayKey}
                                    >
                                        <input
                                            type="date"
                                            value={newDate}
                                            min={todayKey}
                                            onChange={e => e.target.value && changeDay(e.target.value)}
                                            aria-label="Choisir un jour"
                                            className="absolute inset-0 opacity-0 cursor-pointer"
                                        />
                                    </DayStepper>
                                </div>

                                <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-5 xl:grid-cols-6 gap-2 mt-4">
                                    {[...PRESET_TIMES, ...customTimes].map(time => {
                                        const taken = takenTimes.has(time);
                                        const past = isPastTime(time);
                                        const selected = selectedTimes.includes(time);
                                        return (
                                            <button
                                                key={time}
                                                type="button"
                                                onClick={() => toggleTime(time)}
                                                disabled={taken || past}
                                                title={taken ? 'Déjà ouvert' : past ? 'Heure passée' : undefined}
                                                className={`relative py-2 text-sm font-bold tabular-nums border-2 transition-all duration-150 active:scale-95 ${selected
                                                    ? 'bg-navy text-paper border-navy'
                                                    : taken
                                                        ? 'border-ok/40 text-ok bg-ok/5'
                                                        : 'border-navy/30 hover:border-navy bg-ticket'
                                                    } disabled:cursor-not-allowed ${past && !taken ? 'opacity-25' : ''}`}
                                            >
                                                {time}
                                                {taken && <Check size={11} className="absolute top-0.5 right-0.5" />}
                                            </button>
                                        );
                                    })}
                                </div>

                                <div className="flex gap-2 mt-3">
                                    <input
                                        type="time"
                                        value={customTime}
                                        onChange={e => setCustomTime(e.target.value)}
                                        className="flex-1 bg-ticket border-2 border-navy/30 px-3 py-2 text-base sm:text-sm outline-none focus:border-navy transition"
                                        aria-label="Autre heure"
                                    />
                                    <button
                                        type="button"
                                        onClick={addCustomTime}
                                        disabled={!customTime || takenTimes.has(customTime) || isPastTime(customTime)}
                                        className="border-2 border-navy/30 px-3 text-sm font-bold hover:border-navy transition disabled:opacity-30"
                                    >
                                        Autre heure
                                    </button>
                                </div>

                                <button
                                    onClick={handleAddSlots}
                                    disabled={selectedTimes.length === 0 || adding}
                                    className="press font-slab mt-5 w-full py-3 text-lg bg-red text-paper shadow-[4px_4px_0_#1c2b4a] flex items-center justify-center gap-2 disabled:opacity-40 disabled:shadow-none"
                                >
                                    {adding ? <Loader2 className="animate-spin" size={18} /> : <Plus size={18} />}
                                    {selectedTimes.length === 0
                                        ? 'Sélectionne des heures'
                                        : `Ouvrir ${selectedTimes.length} créneau${selectedTimes.length > 1 ? 'x' : ''}`}
                                </button>
                            </section>
                        </Reveal>
                    </div>

                    {/* Planning */}
                    <Reveal delay={150} className={onTab('planning')}>
                        <section className="card-hard overflow-hidden">
                            <div className="p-5 sm:p-6 border-b-2 border-navy space-y-4">
                                <DayStepper
                                    day={selectedDay}
                                    onPrev={() => shiftDay(-1)}
                                    onNext={() => shiftDay(1)}
                                    prevDisabled={newDate <= todayKey}
                                    title="Planning"
                                />
                                <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-bold">
                                    <span className="flex gap-3">
                                        {prevKey && (
                                            <button onClick={() => changeDay(prevKey)} className="underline underline-offset-4 hover:text-red py-1">
                                                ← {format(new Date(`${prevKey}T12:00`), 'EEE d', { locale: fr })}
                                            </button>
                                        )}
                                        {newDate !== todayKey && (
                                            <button onClick={() => changeDay(todayKey)} className="underline underline-offset-4 hover:text-red py-1">
                                                Aujourd&apos;hui
                                            </button>
                                        )}
                                        {nextKey && (
                                            <button onClick={() => changeDay(nextKey)} className="underline underline-offset-4 hover:text-red py-1">
                                                {format(new Date(`${nextKey}T12:00`), 'EEE d', { locale: fr })} →
                                            </button>
                                        )}
                                    </span>
                                    <span>{daySlots.filter(s => s.isBooked).length}/{daySlots.length} réservé{daySlots.length > 1 ? 's' : ''}</span>
                                </div>
                                <div className="flex border-2 border-navy text-sm font-bold w-full sm:w-auto *:flex-1">
                                    {([
                                        ['all', 'Tous', daySlots.length],
                                        ['booked', 'Réservés', daySlots.filter(s => s.isBooked).length],
                                        ['free', 'Libres', daySlots.filter(s => !s.isBooked).length],
                                    ] as const).map(([key, label, count]) => (
                                        <button
                                            key={key}
                                            onClick={() => setFilter(key)}
                                            className={`px-3 sm:px-4 py-1.5 transition-colors ${filter === key ? 'bg-navy text-paper' : 'hover:bg-navy/10'}`}
                                        >
                                            {label} <span className="opacity-70 tabular-nums">{count}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {loading && slots.length === 0 ? (
                                <div className="p-6 space-y-3">
                                    {Array.from({ length: 5 }).map((_, i) => (
                                        <div key={i} className="skeleton animate-shimmer h-16" />
                                    ))}
                                </div>
                            ) : filtered.length === 0 ? (
                                <div key={newDate} className="anim-pop p-12 text-center">
                                    <Clock size={28} className="mx-auto mb-3" />
                                    <p className="font-bold">
                                        {daySlots.length === 0 ? 'Aucun créneau ce jour-là' : filter === 'booked' ? 'Aucune réservation ce jour-là' : 'Plus de place libre ce jour-là'}
                                    </p>
                                    <p className="text-sm mt-1">
                                        {nextKey ? 'Utilise les flèches pour passer au jour suivant.' : 'Ouvre des créneaux pour que tes clients puissent réserver.'}
                                    </p>
                                </div>
                            ) : (
                                <div key={`${newDate}-${filter}`} className="anim-dispense">
                                            <ul className="divide-y-2 divide-dashed divide-navy/15">
                                                {filtered.map(slot => {
                                                    const past = new Date(slot.startTime) <= now;
                                                    const armed = armedDelete === slot.id;
                                                    return (
                                                        <li
                                                            key={slot.id}
                                                            className={`group flex items-center gap-4 px-5 sm:px-6 py-4 hover:bg-ticket transition-colors ${past ? 'opacity-45' : ''}`}
                                                        >
                                                            <span className="font-slab text-xl tabular-nums w-16 shrink-0">
                                                                {format(new Date(slot.startTime), 'HH:mm')}
                                                            </span>
                                                            <span className={`size-2.5 rounded-full shrink-0 ${slot.isBooked ? 'bg-red' : 'border-2 border-navy/30'}`} />
                                                            <div className="flex-1 min-w-0">
                                                                {slot.isBooked ? (
                                                                    <>
                                                                        <p className="font-bold flex items-center gap-2 truncate">
                                                                            <UserRound size={14} className="shrink-0" />
                                                                            {slot.clientName}
                                                                        </p>
                                                                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-sm">
                                                                            {slot.clientPhone && (
                                                                                <a href={`tel:${slot.clientPhone}`} className="flex items-center gap-1.5 py-2 -my-2 hover:text-red transition">
                                                                                    <Phone size={13} /> {slot.clientPhone}
                                                                                </a>
                                                                            )}
                                                                            {slot.clientEmail && (
                                                                                <a href={`mailto:${slot.clientEmail}`} className="flex items-center gap-1.5 py-2 -my-2 hover:text-red transition truncate">
                                                                                    <Mail size={13} /> {slot.clientEmail}
                                                                                </a>
                                                                            )}
                                                                        </div>
                                                                    </>
                                                                ) : (
                                                                    <p className="text-sm">{past ? 'Non réservé' : 'Disponible'}</p>
                                                                )}
                                                            </div>
                                                            <button
                                                                onClick={() => handleDeleteSlot(slot)}
                                                                aria-label="Supprimer"
                                                                className={`shrink-0 flex items-center gap-1.5 text-sm transition-all ${armed
                                                                    ? 'bg-red text-paper px-3 py-1.5 font-bold'
                                                                    : 'p-2 sm:opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-red hover:bg-red/10'
                                                                    }`}
                                                            >
                                                                <Trash2 size={16} />
                                                                {armed && (slot.isBooked ? 'Annuler le RDV ?' : 'Confirmer')}
                                                            </button>
                                                        </li>
                                                    );
                                                })}
                                            </ul>
                                </div>
                            )}
                        </section>
                    </Reveal>
                </div>

                {/* Téléphone : réglages regroupés dans leur onglet */}
                {tab === 'reglages' && (
                    <section className="lg:hidden anim-pop space-y-3">
                        <button
                            onClick={togglePush}
                            disabled={pushState === 'loading'}
                            className="card-hard press w-full flex items-center gap-3 px-5 py-4 font-bold text-left"
                        >
                            {pushState === 'loading' ? <Loader2 size={20} className="animate-spin text-red" />
                                : pushState === 'on' ? <BellRing size={20} className="text-ok" /> : <Bell size={20} className="text-red" />}
                            <span className="flex-1">
                                {pushState === 'on' ? 'Notifications activées' : 'Activer les notifications'}
                                <span className="block text-sm font-normal">Être prévenu à chaque nouvelle réservation</span>
                            </span>
                        </button>
                        <button onClick={fetchSlots} className="card-hard press w-full flex items-center gap-3 px-5 py-4 font-bold">
                            <RefreshCw size={20} className={`text-red ${loading ? 'animate-spin' : ''}`} /> Actualiser le planning
                        </button>
                        <a href="/" target="_blank" className="card-hard press w-full flex items-center gap-3 px-5 py-4 font-bold">
                            <ExternalLink size={20} className="text-red" /> Voir le site client
                        </a>
                        <button onClick={handleLogout} className="card-hard press w-full flex items-center gap-3 px-5 py-4 font-bold">
                            <LogOut size={20} className="text-red" /> {demo ? 'Quitter la démo' : 'Déconnexion'}
                        </button>
                    </section>
                )}
            </main>

            {/* Téléphone : barre d'onglets en bas, à portée de pouce */}
            <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 safe-bottom bg-navy border-t-2 border-red">
                <div className="max-w-md mx-auto grid grid-cols-3">
                    {([
                        ['planning', 'Planning', CalendarDays],
                        ['ouvrir', 'Ouvrir', Plus],
                        ['reglages', 'Réglages', Settings],
                    ] as const).map(([key, label, Icon]) => (
                        <button
                            key={key}
                            onClick={() => { setTab(key); window.scrollTo({ top: 0 }); }}
                            aria-current={tab === key ? 'page' : undefined}
                            className={`flex flex-col items-center gap-1 py-2.5 text-xs font-bold transition-colors ${tab === key ? 'text-gold' : 'text-paper/70'}`}
                        >
                            <Icon size={22} />
                            {label}
                        </button>
                    ))}
                </div>
            </nav>
            {toasts}
        </div>
    );
}

// Sélecteur de jour : flèches pour passer au jour précédent / suivant, appui sur la date pour choisir dans le calendrier
function DayStepper({ day, onPrev, onNext, prevDisabled, title, children }: {
    day: Date; onPrev: () => void; onNext: () => void; prevDisabled?: boolean; title?: string; children?: React.ReactNode;
}) {
    const arrow = 'press size-12 shrink-0 grid place-items-center border-2 border-navy bg-ticket shadow-[3px_3px_0_#1c2b4a] disabled:opacity-30 disabled:shadow-none';
    return (
        <div className="flex items-center gap-3">
            <button type="button" onClick={onPrev} disabled={prevDisabled} aria-label="Jour précédent" className={arrow}>
                <ChevronLeft size={22} />
            </button>
            <div className="relative flex-1 min-w-0 text-center">
                {title && <p className="text-xs font-bold uppercase tracking-[0.25em] text-red">{title}</p>}
                <p key={day.toDateString()} className="anim-pop font-slab text-xl sm:text-2xl leading-tight first-letter:uppercase truncate">
                    {dayLabel(day)}
                </p>
                {(isToday(day) || isTomorrow(day)) && (
                    <p className="text-xs capitalize">{format(day, 'EEEE d MMMM', { locale: fr })}</p>
                )}
                {children}
            </div>
            <button type="button" onClick={onNext} aria-label="Jour suivant" className={arrow}>
                <ChevronRight size={22} />
            </button>
        </div>
    );
}
