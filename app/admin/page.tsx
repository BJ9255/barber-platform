'use client';

import Link from 'next/link';
import { useState, useEffect, useCallback, useRef } from 'react';
import { format, isSameDay, isToday, isTomorrow, formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
    Trash2, Plus, Loader2, Phone, Mail, Eye, EyeOff, ArrowLeft, LogOut, ExternalLink,
    RefreshCw, CalendarCheck, CalendarPlus, Sun, UserRound, Clock, Check, Sparkles, Bell, BellRing,
} from 'lucide-react';
import { BarberPole, Logo, useToasts } from '../components/ui';
import { generateDemoSlots } from './demo';
import { warp } from '../components/Starfield';
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
    const [armedDelete, setArmedDelete] = useState<string | null>(null);
    const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Ajout de créneaux
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
            if (ok > 0) notify(`${ok} créneau${ok > 1 ? 'x' : ''} ajouté${ok > 1 ? 's' : ''}`);
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
            <div className="min-h-dvh grid place-items-center bg-atmosphere">
                <Loader2 className="animate-spin text-brass" size={28} />
            </div>
        );
    }

    if (!isAuthenticated) {
        return (
            <div className="min-h-dvh bg-atmosphere flex flex-col items-center justify-center p-4">
                <form
                    onSubmit={handleLogin}
                    className="animate-scale-in w-full max-w-sm rounded-3xl border border-line bg-surface/90 backdrop-blur p-8 shadow-2xl shadow-black/50"
                >
                    <div className="flex justify-center mb-6">
                        <BarberPole size="md" />
                    </div>
                    <h1 className="font-display text-3xl text-center">Espace coiffeur</h1>
                    <p className="text-muted text-sm text-center mt-2">Gère tes créneaux et tes clients.</p>

                    <div key={loginError} className={`relative mt-8 ${loginError ? 'animate-shake' : ''}`}>
                        <input
                            type={showPassword ? 'text' : 'password'}
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            placeholder="Mot de passe"
                            autoComplete="current-password"
                            autoFocus={canAutoFocus}
                            enterKeyHint="go"
                            className={`w-full bg-ink border rounded-xl px-4 pr-12 py-3 outline-none transition focus:ring-4 ${loginError
                                ? 'border-rust focus:ring-rust/15'
                                : 'border-line focus:border-brass focus:ring-brass/15'
                                }`}
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword(v => !v)}
                            aria-label={showPassword ? 'Masquer' : 'Afficher'}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-2.5 text-muted hover:text-cream transition"
                        >
                            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                    </div>
                    {loginError && <p className="text-rust text-sm mt-2">{loginError}</p>}

                    <button
                        type="submit"
                        disabled={!password || loggingIn}
                        className="mt-5 w-full rounded-full bg-brass text-ink font-semibold py-3 hover:bg-brass-light transition flex items-center justify-center gap-2 disabled:opacity-40"
                    >
                        {loggingIn && <Loader2 className="animate-spin" size={18} />}
                        Entrer
                    </button>

                    <div className="flex items-center gap-3 my-5 text-xs text-muted/70">
                        <span className="h-px flex-1 bg-line" /> ou <span className="h-px flex-1 bg-line" />
                    </div>
                    <button
                        type="button"
                        onClick={startDemo}
                        className="w-full rounded-full border border-line hover:border-brass hover:text-brass-light py-3 transition flex items-center justify-center gap-2"
                    >
                        <Sparkles size={17} className="text-brass" />
                        Voir la démo
                    </button>
                    <p className="text-xs text-muted/70 text-center mt-2">Données fictives, rien n&apos;est enregistré.</p>
                </form>
                <Link href="/" className="mt-4 py-2 flex items-center gap-2 text-sm text-muted hover:text-cream transition">
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

    const filtered = slots.filter(s =>
        filter === 'booked' ? s.isBooked : filter === 'free' ? !s.isBooked : true
    );
    const groups: { day: Date; slots: Slot[] }[] = [];
    for (const slot of filtered) {
        const d = new Date(slot.startTime);
        const last = groups[groups.length - 1];
        if (last && isSameDay(last.day, d)) last.slots.push(slot);
        else groups.push({ day: d, slots: [slot] });
    }

    return (
        <div className="min-h-dvh bg-atmosphere">
            <header className="safe-top sticky top-0 z-40 border-b border-line/60 bg-ink/75 backdrop-blur-md">
                <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
                    <Logo />
                    <div className="flex items-center gap-1 sm:gap-2">
                        <a
                            href="/"
                            target="_blank"
                            aria-label="Voir le site"
                            className="min-h-10 min-w-10 justify-center flex items-center gap-2 text-sm text-muted hover:text-cream px-3 py-2 rounded-full hover:bg-surface-2 transition"
                        >
                            <ExternalLink size={15} />
                            <span className="hidden sm:inline">Voir le site</span>
                        </a>
                        <button
                            onClick={handleLogout}
                            aria-label={demo ? 'Quitter la démo' : 'Déconnexion'}
                            className="min-h-10 min-w-10 justify-center flex items-center gap-2 text-sm text-muted hover:text-cream px-3 py-2 rounded-full hover:bg-surface-2 transition"
                        >
                            <LogOut size={15} />
                            <span className="hidden sm:inline">{demo ? 'Quitter la démo' : 'Déconnexion'}</span>
                        </button>
                    </div>
                </div>
                {demo && (
                    <div className="border-t border-brass/20 bg-brass/10 text-brass-light text-sm">
                        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-2 flex items-center justify-center gap-2 text-center">
                            <Sparkles size={15} className="shrink-0" />
                            Mode démo : les clients sont fictifs et rien n&apos;est enregistré.
                        </div>
                    </div>
                )}
            </header>

            <main className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
                <div className="animate-fade-up flex flex-wrap items-end justify-between gap-4 mb-10">
                    <div>
                        <p className="text-brass text-sm tracking-[0.2em] uppercase">
                            {format(now, 'EEEE d MMMM', { locale: fr })}
                        </p>
                        <h1 className="font-display text-4xl sm:text-5xl mt-2">Tableau de bord</h1>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button
                            onClick={togglePush}
                            disabled={pushState === 'loading'}
                            className={`flex items-center gap-2 text-sm border rounded-full px-4 py-2 transition ${pushState === 'on'
                                ? 'border-sage/40 text-sage hover:border-sage'
                                : 'border-line text-muted hover:text-cream hover:border-brass'
                                }`}
                        >
                            {pushState === 'loading' ? <Loader2 size={15} className="animate-spin" />
                                : pushState === 'on' ? <BellRing size={15} /> : <Bell size={15} />}
                            {pushState === 'on' ? 'Notifications activées' : 'Activer les notifications'}
                        </button>
                        <button
                            onClick={fetchSlots}
                            className="flex items-center gap-2 text-sm text-muted hover:text-cream border border-line hover:border-brass rounded-full px-4 py-2 transition"
                        >
                            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
                            Actualiser
                        </button>
                    </div>
                </div>

                {/* Statistiques */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                    {[
                        { icon: CalendarCheck, label: 'Réservations à venir', value: bookedUpcoming.length, tone: 'text-sage' },
                        { icon: CalendarPlus, label: 'Créneaux libres', value: freeUpcoming.length, tone: 'text-brass' },
                        { icon: Sun, label: "Clients aujourd'hui", value: bookedToday.length, tone: 'text-cream' },
                    ].map(({ icon: Icon, label, value, tone }, i) => (
                        <div
                            key={label}
                            className="animate-fade-up rounded-2xl border border-line bg-surface/80 p-5 flex items-center gap-4"
                            style={{ animationDelay: `${80 + i * 70}ms` }}
                        >
                            <div className="size-11 rounded-xl bg-surface-2 grid place-items-center">
                                <Icon size={20} className={tone} />
                            </div>
                            <div>
                                <p className="font-display text-3xl tabular-nums leading-none">{loading && slots.length === 0 ? '–' : value}</p>
                                <p className="text-sm text-muted mt-1">{label}</p>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="grid lg:grid-cols-[1fr_1.15fr] gap-6 items-start">
                    <div className="space-y-6 lg:sticky lg:top-24">
                        {/* Prochain client */}
                        <section
                            className="animate-fade-up rounded-2xl border border-brass/30 bg-gradient-to-br from-brass/10 to-surface/80 p-6"
                            style={{ animationDelay: '300ms' }}
                        >
                            <p className="text-xs text-brass tracking-[0.2em] uppercase">Prochain client</p>
                            {nextBooking ? (
                                <>
                                    <div className="flex items-start justify-between gap-4 mt-3">
                                        <div>
                                            <p className="font-display text-2xl">{nextBooking.clientName}</p>
                                            <p className="text-muted text-sm mt-1 first-letter:uppercase">
                                                {dayLabel(new Date(nextBooking.startTime))} · {format(new Date(nextBooking.startTime), 'HH:mm')}
                                            </p>
                                        </div>
                                        <span className="shrink-0 text-xs rounded-full bg-brass/15 text-brass-light px-3 py-1">
                                            {formatDistanceToNow(new Date(nextBooking.startTime), { addSuffix: true, locale: fr })}
                                        </span>
                                    </div>
                                    <div className="flex flex-wrap gap-2 mt-5">
                                        {nextBooking.clientPhone && (
                                            <a
                                                href={`tel:${nextBooking.clientPhone}`}
                                                className="flex items-center gap-2 rounded-full bg-brass text-ink text-sm font-semibold px-4 py-2 hover:bg-brass-light transition"
                                            >
                                                <Phone size={15} /> {nextBooking.clientPhone}
                                            </a>
                                        )}
                                        {nextBooking.clientEmail && (
                                            <a
                                                href={`mailto:${nextBooking.clientEmail}`}
                                                className="flex items-center gap-2 rounded-full border border-line text-sm px-4 py-2 hover:border-brass transition"
                                            >
                                                <Mail size={15} /> Email
                                            </a>
                                        )}
                                    </div>
                                </>
                            ) : (
                                <p className="text-muted mt-3">Aucune réservation à venir pour l&apos;instant.</p>
                            )}
                        </section>

                        {/* Ajouter des créneaux */}
                        <section
                            className="animate-fade-up rounded-2xl border border-line bg-surface/80 p-6"
                            style={{ animationDelay: '380ms' }}
                        >
                            <h2 className="font-display text-xl flex items-center gap-2">
                                <Plus size={20} className="text-brass" /> Ouvrir des créneaux
                            </h2>
                            <p className="text-sm text-muted mt-1">Choisis un jour, puis toutes les heures à ouvrir.</p>

                            <input
                                type="date"
                                value={newDate}
                                min={format(now, 'yyyy-MM-dd')}
                                onChange={e => { setNewDate(e.target.value); setSelectedTimes([]); }}
                                className="mt-5 w-full bg-ink border border-line rounded-xl px-4 py-3 outline-none focus:border-brass focus:ring-4 focus:ring-brass/15 transition"
                            />
                            {newDate && (
                                <p className="text-sm text-muted mt-2 first-letter:uppercase">
                                    {format(new Date(`${newDate}T12:00`), 'EEEE d MMMM', { locale: fr })}
                                </p>
                            )}

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
                                            className={`relative rounded-lg py-2 text-sm tabular-nums border transition-all duration-150 active:scale-95 ${selected
                                                ? 'bg-brass text-ink border-brass font-semibold'
                                                : taken
                                                    ? 'border-sage/30 text-sage/70 bg-sage/5 cursor-not-allowed'
                                                    : 'border-line hover:border-brass/60'
                                                } disabled:cursor-not-allowed ${past && !taken ? 'opacity-25' : ''}`}
                                        >
                                            {time}
                                            {taken && <Check size={11} className="absolute top-1 right-1" />}
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="flex gap-2 mt-3">
                                <input
                                    type="time"
                                    value={customTime}
                                    onChange={e => setCustomTime(e.target.value)}
                                    className="flex-1 bg-ink border border-line rounded-lg px-3 py-2 text-base sm:text-sm outline-none focus:border-brass transition"
                                    aria-label="Autre heure"
                                />
                                <button
                                    type="button"
                                    onClick={addCustomTime}
                                    disabled={!customTime || takenTimes.has(customTime) || isPastTime(customTime)}
                                    className="rounded-lg border border-line px-3 text-sm hover:border-brass transition disabled:opacity-30"
                                >
                                    Autre heure
                                </button>
                            </div>

                            <button
                                onClick={handleAddSlots}
                                disabled={selectedTimes.length === 0 || adding}
                                className="mt-5 w-full rounded-full bg-brass text-ink font-semibold py-3 hover:bg-brass-light transition flex items-center justify-center gap-2 disabled:opacity-35 disabled:cursor-not-allowed"
                            >
                                {adding ? <Loader2 className="animate-spin" size={18} /> : <Plus size={18} />}
                                {selectedTimes.length === 0
                                    ? 'Sélectionne des heures'
                                    : `Ouvrir ${selectedTimes.length} créneau${selectedTimes.length > 1 ? 'x' : ''}`}
                            </button>
                        </section>
                    </div>

                    {/* Liste des créneaux */}
                    <section
                        className="animate-fade-up rounded-2xl border border-line bg-surface/80 overflow-hidden"
                        style={{ animationDelay: '460ms' }}
                    >
                        <div className="p-5 sm:p-6 border-b border-line flex flex-wrap items-center justify-between gap-3">
                            <h2 className="font-display text-xl">Planning</h2>
                            <div className="flex rounded-full bg-ink p-1 border border-line text-sm">
                                {([
                                    ['all', 'Tous', slots.length],
                                    ['booked', 'Réservés', slots.filter(s => s.isBooked).length],
                                    ['free', 'Libres', slots.filter(s => !s.isBooked).length],
                                ] as const).map(([key, label, count]) => (
                                    <button
                                        key={key}
                                        onClick={() => setFilter(key)}
                                        className={`px-3 sm:px-4 py-1.5 rounded-full transition-all ${filter === key ? 'bg-surface-2 text-cream shadow' : 'text-muted hover:text-cream'}`}
                                    >
                                        {label} <span className="text-muted/70 tabular-nums">{count}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {loading && slots.length === 0 ? (
                            <div className="p-6 space-y-3">
                                {Array.from({ length: 5 }).map((_, i) => (
                                    <div key={i} className="skeleton animate-shimmer h-16 rounded-xl" />
                                ))}
                            </div>
                        ) : groups.length === 0 ? (
                            <div className="p-12 text-center">
                                <Clock size={28} className="mx-auto text-muted mb-3" />
                                <p className="font-medium">Rien à afficher</p>
                                <p className="text-sm text-muted mt-1">Ouvre des créneaux pour que tes clients puissent réserver.</p>
                            </div>
                        ) : (
                            <div key={filter} className="divide-y divide-line">
                                {groups.map(({ day, slots: daySlots }, gi) => (
                                    <div key={day.toISOString()} className="animate-fade-in" style={{ animationDelay: `${gi * 50}ms` }}>
                                        <div className="px-5 sm:px-6 py-3 bg-ink/40 flex items-center justify-between text-sm">
                                            <span className="font-medium first-letter:uppercase">{dayLabel(day)}</span>
                                            <span className="text-muted">
                                                {daySlots.filter(s => s.isBooked).length}/{daySlots.length} réservé{daySlots.length > 1 ? 's' : ''}
                                            </span>
                                        </div>
                                        <ul>
                                            {daySlots.map(slot => {
                                                const past = new Date(slot.startTime) <= now;
                                                const armed = armedDelete === slot.id;
                                                return (
                                                    <li
                                                        key={slot.id}
                                                        className={`group flex items-center gap-4 px-5 sm:px-6 py-4 hover:bg-surface-2/50 transition-colors ${past ? 'opacity-45' : ''}`}
                                                    >
                                                        <span className="font-display text-lg tabular-nums w-14 shrink-0">
                                                            {format(new Date(slot.startTime), 'HH:mm')}
                                                        </span>
                                                        <span className={`size-2 rounded-full shrink-0 ${slot.isBooked ? 'bg-sage' : 'bg-line'}`} />
                                                        <div className="flex-1 min-w-0">
                                                            {slot.isBooked ? (
                                                                <>
                                                                    <p className="font-medium flex items-center gap-2 truncate">
                                                                        <UserRound size={14} className="text-muted shrink-0" />
                                                                        {slot.clientName}
                                                                    </p>
                                                                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-sm text-muted">
                                                                        {slot.clientPhone && (
                                                                            <a href={`tel:${slot.clientPhone}`} className="flex items-center gap-1.5 py-2 -my-2 hover:text-brass transition">
                                                                                <Phone size={13} /> {slot.clientPhone}
                                                                            </a>
                                                                        )}
                                                                        {slot.clientEmail && (
                                                                            <a href={`mailto:${slot.clientEmail}`} className="flex items-center gap-1.5 py-2 -my-2 hover:text-brass transition truncate">
                                                                                <Mail size={13} /> {slot.clientEmail}
                                                                            </a>
                                                                        )}
                                                                    </div>
                                                                </>
                                                            ) : (
                                                                <p className="text-muted text-sm">{past ? 'Non réservé' : 'Disponible'}</p>
                                                            )}
                                                        </div>
                                                        <button
                                                            onClick={() => handleDeleteSlot(slot)}
                                                            aria-label="Supprimer"
                                                            className={`shrink-0 flex items-center gap-1.5 rounded-full text-sm transition-all ${armed
                                                                ? 'bg-rust text-ink px-3 py-1.5 font-medium'
                                                                : 'p-2 text-muted sm:opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-rust hover:bg-rust/10'
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
                                ))}
                            </div>
                        )}
                    </section>
                </div>
            </main>
            {toasts}
        </div>
    );
}
