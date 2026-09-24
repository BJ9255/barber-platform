'use client';

import Link from 'next/link';
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  format, startOfWeek, endOfWeek, addDays, isSameDay, addWeeks, subWeeks, isToday, isBefore, startOfDay,
} from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  ChevronLeft, ChevronRight, Loader2, ArrowRight, CalendarDays, Clock, UserRound, Phone, Mail, X, Scissors, Lock,
} from 'lucide-react';
import { Logo, SHOP_NAME, useToasts } from './components/ui';
import { warp } from './components/Starfield';

type Slot = {
  id: string;
  startTime: string;
  isBooked: boolean;
};

const isPast = (slot: Slot) => new Date(slot.startTime) <= new Date();
const isFree = (slot: Slot) => !slot.isBooked && !isPast(slot);
const toDateParam = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function BookingPage() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [upcoming, setUpcoming] = useState<Slot[] | undefined>(undefined);

  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [bookedSlot, setBookedSlot] = useState<Slot | null>(null);
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const pendingJump = useRef<Slot | null>(null);
  const { notify, toasts } = useToasts();

  // Prochains créneaux libres, affichés dans la carte « Disponibles » du haut de page
  const fetchUpcoming = useCallback(async () => {
    try {
      const res = await fetch('/api/slots?scope=upcoming', { cache: 'no-store' });
      setUpcoming(res.ok ? await res.json() : []);
    } catch {
      setUpcoming([]);
    }
  }, []);
  const nextSlot = upcoming?.[0] ?? null;

  const fetchSlots = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/slots?date=${toDateParam(weekStart)}`, { cache: 'no-store' });
      const data: Slot[] = res.ok ? await res.json() : [];
      setSlots(data);

      // Choix du jour affiché : saut demandé > jour déjà choisi > premier jour avec des dispos > aujourd'hui
      const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
      const jump = pendingJump.current;
      pendingJump.current = null;
      setSelectedDay(prev => {
        if (jump) return startOfDay(new Date(jump.startTime));
        if (prev && days.some(d => isSameDay(d, prev))) return prev;
        const firstFree = days.find(d => data.some(s => isFree(s) && isSameDay(new Date(s.startTime), d)));
        return firstFree ?? days.find(d => isToday(d)) ?? days[0];
      });
      if (jump) {
        const fresh = data.find(s => s.id === jump.id);
        if (fresh && isFree(fresh)) setSelectedSlot(fresh);
      }
    } catch (error) {
      console.error('Failed to fetch slots', error);
      notify('Impossible de charger les créneaux', 'error');
    } finally {
      setLoading(false);
    }
  }, [weekStart, notify]);

  useEffect(() => { fetchSlots(); }, [fetchSlots]);
  useEffect(() => { fetchUpcoming(); }, [fetchUpcoming]);

  // Fermer la fenêtre avec Échap
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeSheet();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const jumpToSlot = (slot: Slot) => {
    const target = startOfWeek(new Date(slot.startTime), { weekStartsOn: 1 });
    document.getElementById('reserver')?.scrollIntoView();
    if (isSameDay(target, weekStart)) {
      setSelectedDay(startOfDay(new Date(slot.startTime)));
      setSelectedSlot(slot);
    } else {
      pendingJump.current = slot;
      setWeekStart(target);
    }
  };

  const closeSheet = () => {
    if (submitting) return;
    setSelectedSlot(null);
    setBookedSlot(null);
    setFormError('');
  };

  const handleBookSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSlot || !clientName.trim() || !clientPhone.trim()) return;

    setSubmitting(true);
    setFormError('');
    try {
      const res = await fetch('/api/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slotId: selectedSlot.id, clientName, clientPhone, clientEmail }),
      });

      if (res.ok) {
        warp(1.2);
        setBookedSlot(selectedSlot);
        setClientName('');
        setClientPhone('');
        setClientEmail('');
        fetchSlots();
        fetchUpcoming();
      } else {
        const err = await res.json();
        if (res.status === 409) {
          setSelectedSlot(null);
          notify(err.error, 'error');
          fetchSlots();
          fetchUpcoming();
        } else {
          setFormError(err.error || 'Une erreur est survenue');
        }
      }
    } catch (error) {
      console.error('Booking failed', error);
      setFormError('Une erreur est survenue, réessaie.');
    } finally {
      setSubmitting(false);
    }
  };

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const isCurrentWeek = isSameDay(weekStart, startOfWeek(new Date(), { weekStartsOn: 1 }));
  const daySlots = selectedDay
    ? slots.filter(s => isSameDay(new Date(s.startTime), selectedDay))
    : [];
  const freeCount = (day: Date) =>
    slots.filter(s => isFree(s) && isSameDay(new Date(s.startTime), day)).length;
  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
  const sheetOpen = !!(selectedSlot || bookedSlot);

  return (
    <div className="min-h-screen bg-atmosphere overflow-x-clip">
      {/* Navigation */}
      <header className="sticky top-0 z-40 border-b border-line/60 bg-ink/75 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Logo />
          <Link
            href="/admin"
            className="flex items-center gap-2 text-sm text-muted hover:text-cream transition-colors"
          >
            <Lock size={14} />
            <span className="hidden sm:inline">Espace coiffeur</span>
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-14 pb-16 sm:pt-24 sm:pb-24 grid md:grid-cols-[1.2fr_1fr] gap-12 items-center">
        <div>
          <p className="animate-fade-up text-brass text-sm font-medium tracking-[0.2em] uppercase mb-5">
            Coupe · Dégradé · Barbe
          </p>
          <h1
            className="animate-fade-up font-display text-5xl sm:text-7xl leading-[1.02] tracking-tight"
            style={{ animationDelay: '80ms' }}
          >
            La coupe,<br />
            <em className="text-brass-light">sans l&apos;attente.</em>
          </h1>
          <p
            className="animate-fade-up mt-6 text-lg text-muted max-w-md leading-relaxed"
            style={{ animationDelay: '160ms' }}
          >
            Choisis ton créneau en quelques secondes. Confirmation immédiate, pas de compte à créer.
          </p>
          <div className="animate-fade-up mt-9 flex flex-wrap gap-3" style={{ animationDelay: '240ms' }}>
            <a
              href="#reserver"
              onClick={() => warp(0.8)}
              className="group inline-flex items-center gap-2 rounded-full bg-brass text-ink font-semibold px-7 py-3.5 hover:bg-brass-light transition-all hover:shadow-[0_0_40px_-8px_rgb(212_162_76/0.7)]"
            >
              Prendre rendez-vous
              <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
            </a>
          </div>
        </div>

        <UpcomingCard slots={upcoming} onPick={jumpToSlot} />
      </section>

      {/* Réservation */}
      <section id="reserver" className="scroll-mt-20 max-w-4xl mx-auto px-4 sm:px-6 pb-24">
        <div className="rounded-3xl border border-line bg-surface/80 backdrop-blur shadow-2xl shadow-black/40 overflow-hidden">
          <div className="p-5 sm:p-8 border-b border-line flex items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl sm:text-3xl">Réserver</h2>
              <p className="text-muted text-sm mt-1 first-letter:uppercase">
                {format(weekStart, 'd MMM', { locale: fr })} – {format(weekEnd, 'd MMM yyyy', { locale: fr })}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setWeekStart(subWeeks(weekStart, 1))}
                disabled={isCurrentWeek}
                aria-label="Semaine précédente"
                className="size-10 grid place-items-center rounded-full border border-line hover:border-brass hover:text-brass transition disabled:opacity-30 disabled:pointer-events-none"
              >
                <ChevronLeft size={20} />
              </button>
              <button
                onClick={() => setWeekStart(addWeeks(weekStart, 1))}
                aria-label="Semaine suivante"
                className="size-10 grid place-items-center rounded-full border border-line hover:border-brass hover:text-brass transition"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          </div>

          {/* Jours de la semaine */}
          <div className="px-3 sm:px-8 pt-6">
            <div className="grid grid-cols-7 gap-1.5 sm:gap-3">
              {weekDays.map(day => {
                const count = freeCount(day);
                const active = selectedDay && isSameDay(day, selectedDay);
                const past = isBefore(day, startOfDay(new Date()));
                return (
                  <button
                    key={day.toISOString()}
                    onClick={() => setSelectedDay(day)}
                    disabled={past}
                    className={`relative flex flex-col items-center rounded-2xl py-3 sm:py-4 border transition-all duration-300 ${active
                      ? 'bg-brass text-ink border-brass shadow-[0_8px_30px_-10px_rgb(212_162_76/0.8)] -translate-y-0.5'
                      : 'border-line hover:border-brass/60 hover:-translate-y-0.5'
                      } disabled:opacity-30 disabled:pointer-events-none`}
                  >
                    <span className={`text-[11px] sm:text-xs uppercase tracking-wider ${active ? 'text-ink/70' : 'text-muted'}`}>
                      {format(day, 'EEE', { locale: fr }).replace('.', '')}
                    </span>
                    <span className="font-display text-xl sm:text-2xl mt-0.5">{format(day, 'd')}</span>
                    <span
                      className={`mt-1.5 h-1.5 w-1.5 rounded-full transition-colors ${loading ? 'bg-transparent' : count > 0
                        ? active ? 'bg-ink' : 'bg-sage'
                        : 'bg-transparent'
                        }`}
                    />
                    {isToday(day) && !active && (
                      <span className="absolute top-1.5 right-1.5 sm:top-2 sm:right-2 h-1 w-1 rounded-full bg-brass" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Créneaux du jour */}
          <div className="p-5 sm:p-8 min-h-64">
            {selectedDay && (
              <p className="text-sm text-muted mb-4 first-letter:uppercase">
                {format(selectedDay, 'EEEE d MMMM', { locale: fr })}
                {!loading && (
                  <span> · {freeCount(selectedDay)} créneau{freeCount(selectedDay) > 1 ? 'x' : ''} disponible{freeCount(selectedDay) > 1 ? 's' : ''}</span>
                )}
              </p>
            )}

            {loading ? (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="skeleton animate-shimmer h-14 rounded-xl" />
                ))}
              </div>
            ) : daySlots.length === 0 ? (
              <div className="animate-fade-in flex flex-col items-center justify-center text-center py-12">
                <div className="size-14 rounded-full bg-surface-2 grid place-items-center mb-4">
                  <Scissors size={22} className="text-muted" />
                </div>
                <p className="font-medium">Aucun créneau ce jour-là</p>
                <p className="text-sm text-muted mt-1">
                  {nextSlot ? 'Essaie un autre jour ou ' : 'De nouveaux créneaux arrivent bientôt.'}
                  {nextSlot && (
                    <button onClick={() => jumpToSlot(nextSlot)} className="text-brass hover:underline">
                      le prochain disponible
                    </button>
                  )}
                </p>
              </div>
            ) : (
              <div key={selectedDay?.toISOString()} className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {daySlots.map((slot, i) => {
                  const free = isFree(slot);
                  return (
                    <button
                      key={slot.id}
                      disabled={!free}
                      onClick={() => setSelectedSlot(slot)}
                      style={{ animationDelay: `${i * 35}ms` }}
                      className={`animate-scale-in group relative h-14 rounded-xl border text-base font-medium tabular-nums transition-all duration-200 ${free
                        ? 'border-line bg-surface-2 hover:border-brass hover:bg-brass hover:text-ink hover:-translate-y-0.5 hover:shadow-lg active:scale-95'
                        : 'border-transparent bg-surface-2/40 text-muted/50 cursor-not-allowed'
                        }`}
                    >
                      {format(new Date(slot.startTime), 'HH:mm')}
                      {!free && (
                        <span className="block text-[10px] uppercase tracking-wider -mt-0.5">
                          {slot.isBooked ? 'Pris' : 'Passé'}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Comment ça marche */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 pb-24">
        <div className="grid sm:grid-cols-3 gap-4">
          {[
            { icon: CalendarDays, title: 'Choisis ton jour', text: 'Les jours avec des places libres sont marqués d’un point vert.' },
            { icon: Clock, title: 'Choisis ton heure', text: 'Un clic sur un créneau et il est à toi pendant que tu remplis.' },
            { icon: Scissors, title: 'Viens te faire couper', text: 'Ta réservation est confirmée tout de suite, rien à attendre.' },
          ].map(({ icon: Icon, title, text }, i) => (
            <div
              key={title}
              className="rounded-2xl border border-line bg-surface/60 p-6 hover:border-brass/50 transition-colors"
            >
              <div className="flex items-center gap-3 mb-3">
                <span className="font-display text-brass text-lg">0{i + 1}</span>
                <Icon size={18} className="text-muted" />
              </div>
              <h3 className="font-medium">{title}</h3>
              <p className="text-sm text-muted mt-1.5 leading-relaxed">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row gap-4 items-center justify-between text-sm text-muted">
          <span>© {new Date().getFullYear()} {SHOP_NAME}</span>
          <Link href="/admin" className="hover:text-cream transition-colors">Espace coiffeur</Link>
        </div>
      </footer>

      {/* Fenêtre de réservation */}
      {sheetOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
          <div className="animate-fade-in absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={closeSheet} />
          <div
            role="dialog"
            aria-modal="true"
            className="animate-sheet-up relative w-full sm:max-w-md bg-surface border border-line rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[92vh] overflow-y-auto"
          >
            <button
              onClick={closeSheet}
              aria-label="Fermer"
              className="absolute top-4 right-4 size-9 grid place-items-center rounded-full text-muted hover:text-cream hover:bg-surface-2 transition"
            >
              <X size={18} />
            </button>

            {bookedSlot ? (
              <div className="p-8 pt-10 text-center">
                <svg viewBox="0 0 52 52" className="size-20 mx-auto mb-5">
                  <circle cx="26" cy="26" r="24" fill="rgb(143 194 141 / 0.12)" stroke="#8fc28d" strokeWidth="2" className="animate-scale-in" />
                  <path
                    d="M15 27l7 7 15-15"
                    fill="none"
                    stroke="#8fc28d"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray="48"
                    className="animate-draw"
                  />
                </svg>
                <h3 className="font-display text-3xl">C&apos;est réservé !</h3>
                <p className="text-muted mt-3">On se voit</p>
                <p className="text-lg font-medium mt-1 first-letter:uppercase">
                  {format(new Date(bookedSlot.startTime), "EEEE d MMMM 'à' HH:mm", { locale: fr })}
                </p>
                <button
                  onClick={closeSheet}
                  className="mt-8 w-full rounded-full bg-brass text-ink font-semibold py-3.5 hover:bg-brass-light transition"
                >
                  Parfait
                </button>
              </div>
            ) : selectedSlot && (
              <form onSubmit={handleBookSlot} className="p-6 sm:p-8">
                <p className="text-brass text-xs font-medium tracking-[0.2em] uppercase">Ta réservation</p>
                <h3 className="font-display text-2xl mt-2 pr-8 first-letter:uppercase">
                  {format(new Date(selectedSlot.startTime), 'EEEE d MMMM', { locale: fr })}
                </h3>
                <p className="flex items-center gap-2 text-muted mt-1">
                  <Clock size={15} /> {format(new Date(selectedSlot.startTime), 'HH:mm')}
                </p>

                <div className="space-y-4 mt-7">
                  <Field icon={UserRound} label="Prénom" required>
                    <input
                      type="text"
                      value={clientName}
                      onChange={e => setClientName(e.target.value)}
                      placeholder="Thomas"
                      autoComplete="given-name"
                      maxLength={100}
                      autoFocus
                      required
                      className={inputClass}
                    />
                  </Field>
                  <Field icon={Phone} label="Téléphone" required>
                    <input
                      type="tel"
                      value={clientPhone}
                      onChange={e => setClientPhone(e.target.value)}
                      placeholder="06 12 34 56 78"
                      autoComplete="tel"
                      required
                      className={inputClass}
                    />
                  </Field>
                  <Field icon={Mail} label="Email" hint="facultatif">
                    <input
                      type="email"
                      value={clientEmail}
                      onChange={e => setClientEmail(e.target.value)}
                      placeholder="thomas@mail.com"
                      autoComplete="email"
                      className={inputClass}
                    />
                  </Field>
                </div>

                {formError && (
                  <p key={formError} className="animate-shake mt-4 text-sm text-rust">{formError}</p>
                )}

                <button
                  type="submit"
                  disabled={!clientName.trim() || !clientPhone.trim() || submitting}
                  className="mt-7 w-full rounded-full bg-brass text-ink font-semibold py-3.5 hover:bg-brass-light transition flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {submitting ? <Loader2 className="animate-spin" size={18} /> : null}
                  Confirmer la réservation
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {toasts}
    </div>
  );
}

const inputClass =
  'w-full bg-ink border border-line rounded-xl pl-11 pr-4 py-3 text-cream placeholder:text-muted/50 outline-none transition focus:border-brass focus:ring-4 focus:ring-brass/15';

function Field({
  icon: Icon, label, hint, required, children,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-sm text-muted mb-1.5">
        {label}
        {required && <span className="text-brass"> *</span>}
        {hint && <span className="text-muted/60"> ({hint})</span>}
      </span>
      <span className="relative block">
        <Icon size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
        {children}
      </span>
    </label>
  );
}

function UpcomingCard({
  slots, onPick,
}: {
  slots: Slot[] | undefined;
  onPick: (slot: Slot) => void;
}) {
  return (
    <div
      className="animate-fade-up rounded-3xl border border-line bg-surface/70 backdrop-blur-md p-5 sm:p-6 shadow-2xl shadow-black/50"
      style={{ animationDelay: '320ms' }}
    >
      <div className="flex items-center justify-between">
        <h2 className="font-display text-2xl">Disponibles</h2>
        <span className="flex items-center gap-2 text-xs text-sage">
          <span className="relative flex size-2">
            <span className="absolute inset-0 rounded-full bg-sage opacity-60 animate-ping" />
            <span className="relative size-2 rounded-full bg-sage" />
          </span>
          En direct
        </span>
      </div>

      <div className="mt-5 space-y-2">
        {slots === undefined ? (
          Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton animate-shimmer h-[66px] rounded-xl" />)
        ) : slots.length === 0 ? (
          <div className="py-8 text-center">
            <Scissors size={22} className="mx-auto text-muted mb-3" />
            <p className="font-medium">Tout est complet pour l&apos;instant</p>
            <p className="text-sm text-muted mt-1">De nouveaux créneaux arrivent bientôt.</p>
          </div>
        ) : (
          slots.map((slot, i) => (
            <button
              key={slot.id}
              onClick={() => onPick(slot)}
              className="animate-fade-up group w-full text-left flex items-center justify-between rounded-xl border border-line bg-ink/50 px-4 py-3 hover:border-brass hover:bg-brass/10 transition"
              style={{ animationDelay: `${400 + i * 70}ms` }}
            >
              <span>
                <span className="block text-xs text-muted first-letter:uppercase">
                  {format(new Date(slot.startTime), 'EEEE d MMMM', { locale: fr })}
                </span>
                <span className="block font-display text-xl tabular-nums">
                  {format(new Date(slot.startTime), 'HH:mm')}
                </span>
              </span>
              <span className="text-sm text-brass flex items-center gap-1 opacity-70 group-hover:opacity-100 transition">
                Réserver <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
              </span>
            </button>
          ))
        )}
      </div>

      <a href="#reserver" className="mt-4 block text-center text-sm text-muted hover:text-cream transition">
        Voir tout le planning
      </a>
    </div>
  );
}
