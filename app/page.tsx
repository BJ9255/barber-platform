'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { addDays, addWeeks, format, isSameDay, isToday, isTomorrow, startOfDay } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ArrowRight, Bell, BellRing, CalendarPlus, Loader2, Lock, Ticket } from 'lucide-react';
import { BarberPole, Reveal, SERVICES, SHOP_NAME, useToasts } from './components/ui';
import { warp } from './components/TicketRain';
import {
  InstallButton, getPushSubscription, pushErrorMessage, saveBooking, updateSavedBooking, type PushError,
} from './components/pwa';

type Slot = {
  id: string;
  startTime: string;
  isBooked: boolean;
};

// Jours proposés à la réservation
const DAYS_AHEAD = 14;

const isFree = (slot: Slot) => !slot.isBooked && new Date(slot.startTime) > new Date();
const toDateParam = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayWord = (d: Date) => (isToday(d) ? "Aujourd'hui" : isTomorrow(d) ? 'Demain' : format(d, 'EEEE', { locale: fr }));

const STEP_TITLES = ['Quel jour ?', 'À quelle heure ?', 'À quel nom ?'];
const HOW_IT_WORKS = [
  ['Choisis ton jour', 'Les jours avec des places libres sont indiqués.'],
  ['Prends ton ticket', 'Un appui sur une heure et elle est à toi.'],
  ['Viens te faire couper', 'Ta réservation est confirmée tout de suite.'],
];

export default function BookingPage() {
  const [slots, setSlots] = useState<Slot[] | undefined>(undefined);
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const [day, setDay] = useState<Date | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [tearing, setTearing] = useState<string | null>(null);

  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const [booked, setBooked] = useState<{ slot: Slot; name: string; token: string } | null>(null);
  const [reminder, setReminder] = useState<'idle' | 'loading' | 'on'>('idle');

  const [compact, setCompact] = useState(false);
  const signRef = useRef<HTMLElement>(null);
  const { notify, toasts } = useToasts();

  // Créneaux des prochaines semaines (l'API les renvoie semaine par semaine, sans donnée client)
  const fetchSlots = useCallback(async () => {
    try {
      const weeks = [new Date(), addWeeks(new Date(), 1), addWeeks(new Date(), 2)];
      const results = await Promise.all(weeks.map(async w => {
        const res = await fetch(`/api/slots?date=${toDateParam(w)}`, { cache: 'no-store' });
        return res.ok ? ((await res.json()) as Slot[]) : [];
      }));
      const unique = new Map(results.flat().map(s => [s.id, s]));
      setSlots([...unique.values()].sort((a, b) => a.startTime.localeCompare(b.startTime)));
    } catch (error) {
      console.error('Failed to fetch slots', error);
      notify('Impossible de charger les créneaux', 'error');
      setSlots([]);
    }
  }, [notify]);

  useEffect(() => { fetchSlots(); }, [fetchSlots]);

  // Petite barre collée en haut quand l'enseigne sort de l'écran (téléphone)
  useEffect(() => {
    const el = signRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setCompact(!entry.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const today = startOfDay(new Date());
  const days = Array.from({ length: DAYS_AHEAD }, (_, i) => addDays(today, i))
    .filter(d => slots?.some(s => isSameDay(new Date(s.startTime), d)));
  const freeOn = (d: Date) => slots?.filter(s => isFree(s) && isSameDay(new Date(s.startTime), d)).length ?? 0;
  const nextFree = slots?.find(isFree) ?? null;

  const goTo = (next: number, strength = 0.5) => {
    setDir(next > step ? 1 : -1);
    setStep(next);
    warp(strength);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Le ticket choisi se détache avant de passer au formulaire
  const pickTicket = (s: Slot) => {
    setTearing(s.id);
    setTimeout(() => {
      setSlot(s);
      setTearing(null);
      setFormError('');
      goTo(2);
    }, 420);
  };

  const jumpToNext = () => {
    if (!nextFree) return;
    setDay(startOfDay(new Date(nextFree.startTime)));
    setSlot(nextFree);
    setFormError('');
    goTo(2);
  };

  const handleBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slot || !clientName.trim() || !clientPhone.trim()) return;

    setSubmitting(true);
    setFormError('');
    try {
      const res = await fetch('/api/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slotId: slot.id, clientName, clientPhone, clientEmail }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        // Le code secret reste sur ce téléphone : il sert à retrouver et annuler le RDV
        saveBooking({ token: data.token, slotId: slot.id, startTime: slot.startTime });
        setBooked({ slot, name: clientName.trim(), token: data.token });
        setReminder('idle');
        setClientName('');
        setClientPhone('');
        setClientEmail('');
        goTo(3, 1.6);
        fetchSlots();
      } else if (res.status === 409) {
        // Quelqu'un a été plus rapide : retour au choix de l'heure, avec les créneaux à jour
        notify(data.error || 'Ce créneau vient d’être réservé', 'error');
        setSlot(null);
        fetchSlots();
        goTo(1);
      } else {
        setFormError(data.error || 'Une erreur est survenue');
      }
    } catch (error) {
      console.error('Booking failed', error);
      setFormError('Une erreur est survenue, réessaie.');
    } finally {
      setSubmitting(false);
    }
  };

  // Rappel par notification le jour du RDV
  const enableReminder = async () => {
    if (!booked) return;
    setReminder('loading');
    try {
      const subscription = await getPushSubscription();
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription, token: booked.token }),
      });
      if (!res.ok) throw new Error();
      updateSavedBooking(booked.token, { reminder: true });
      setReminder('on');
    } catch (error) {
      setReminder('idle');
      notify(pushErrorMessage[error as PushError] ?? "Impossible d'activer le rappel", 'error');
    }
  };

  const restart = () => {
    setBooked(null);
    setSlot(null);
    setDay(null);
    goTo(0);
  };

  const enter = dir === 1 ? 'anim-from-right' : 'anim-from-left';
  const daySlots = day ? (slots ?? []).filter(s => isSameDay(new Date(s.startTime), day)) : [];

  return (
    <div className="min-h-dvh overflow-x-clip flex flex-col">
      {compact && (
        <div className="anim-bar safe-top lg:hidden fixed top-0 inset-x-0 z-40 bg-navy text-paper">
          <div className="h-12 flex items-center justify-center gap-3">
            <BarberPole size="sm" light />
            <span className="font-slab text-lg">{SHOP_NAME}</span>
            <BarberPole size="sm" light />
          </div>
        </div>
      )}

      {/* Ordinateur : deux colonnes, l'enseigne reste fixe à gauche pendant le défilement */}
      <div className="flex-1 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <header
          ref={signRef}
          className="safe-top relative px-5 pb-6 text-center max-w-md mx-auto lg:max-w-none lg:mx-0 lg:sticky lg:top-0 lg:h-dvh lg:flex lg:flex-col lg:justify-center lg:px-14 xl:px-20 lg:py-12 lg:bg-navy lg:text-paper"
        >
          {/* Téléphone : raccourcis au-dessus de l'enseigne */}
          <nav className="lg:hidden flex items-center justify-end gap-1 pt-3 -mr-2 text-sm">
            <InstallButton className="press flex items-center gap-1.5 px-3 py-1.5 mr-1 border-2 border-navy bg-paper-2 font-bold shadow-[2px_2px_0_#1c2b4a]" />
            <Link href="/mes-rdv" className="flex items-center gap-1.5 px-3 py-2 min-h-10 font-bold hover:text-red transition">
              <Ticket size={16} /> Mes RDV
            </Link>
            <Link href="/admin" aria-label="Espace coiffeur" className="grid place-items-center size-10 hover:text-red transition">
              <Lock size={16} />
            </Link>
          </nav>

          <div className="anim-swing flex items-center justify-center gap-4 lg:gap-8 mt-4 lg:mt-0">
            <BarberPole size="lg" />
            <div>
              <p className="text-xs lg:text-sm font-bold uppercase tracking-[0.3em] text-red lg:text-gold">Barbier · sur rendez-vous</p>
              <h1 className="font-slab text-[42px] lg:text-[48px] xl:text-[62px] leading-none mt-1 lg:mt-3">{SHOP_NAME}</h1>
              <p className="text-sm lg:text-lg mt-2 lg:mt-4">{SERVICES}</p>
            </div>
            <BarberPole size="lg" />
          </div>

          <div className="hidden lg:block mt-14 text-left">
            <HowItWorks onDark />
            <nav className="mt-10 flex flex-wrap items-center gap-6 text-sm">
              <Link href="/mes-rdv" className="underline underline-offset-4 hover:text-gold transition">Mes RDV</Link>
              <Link href="/admin" className="underline underline-offset-4 hover:text-gold transition">Espace coiffeur</Link>
              <InstallButton className="press flex items-center gap-1.5 px-3 py-1.5 border-2 border-paper text-paper font-bold hover:bg-paper hover:text-navy" />
            </nav>
          </div>
        </header>

        <div className="lg:flex lg:items-start lg:justify-center lg:px-12 lg:py-16">
          <main className="px-5 pb-16 max-w-md mx-auto lg:mx-0 lg:w-full lg:max-w-xl lg:p-10 lg:border-2 lg:border-navy lg:bg-paper-2 lg:shadow-[8px_8px_0_#1c2b4a]">
            {step < 3 && (
              <>
                <div className="flex items-center justify-between text-sm min-h-6">
                  {step > 0
                    ? <button onClick={() => goTo(step - 1)} className="underline underline-offset-4 py-2 -my-2 hover:text-red">← Retour</button>
                    : <span />}
                  <span>Étape {step + 1} / 3</span>
                </div>
                <div className="flex gap-1.5 mt-3">
                  {[0, 1, 2].map(i => (
                    <span key={i} className="h-1.5 flex-1 overflow-hidden bg-line">
                      <span className="block h-full bg-red transition-transform duration-500 origin-left" style={{ transform: `scaleX(${i <= step ? 1 : 0})` }} />
                    </span>
                  ))}
                </div>
              </>
            )}

            {/* key = étape : l'écran est recréé, donc son animation d'entrée rejoue */}
            <div key={step} className={enter}>
              {step < 3 && <h2 className="font-slab text-4xl mt-6">{STEP_TITLES[step]}</h2>}

              {step === 0 && (
                <>
                  {nextFree && (
                    <button
                      onClick={jumpToNext}
                      className="notched press w-full mt-5 px-6 py-4 flex items-center justify-between gap-3 bg-navy text-paper text-left"
                    >
                      <span>
                        <span className="block text-[11px] font-bold uppercase tracking-[0.25em] text-gold">Prochaine place libre</span>
                        <span className="block font-slab text-2xl mt-0.5 first-letter:uppercase">
                          {dayWord(new Date(nextFree.startTime))} · {format(new Date(nextFree.startTime), 'HH:mm')}
                        </span>
                      </span>
                      <ArrowRight size={22} className="shrink-0" />
                    </button>
                  )}

                  {slots === undefined ? (
                    <div className="mt-5 space-y-2.5">
                      {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton animate-shimmer h-[70px]" />)}
                    </div>
                  ) : days.length === 0 ? (
                    <div className="card-hard mt-5 p-8 text-center">
                      <p className="font-slab text-2xl">Tout est complet</p>
                      <p className="text-sm mt-2">De nouveaux créneaux arrivent bientôt. Repasse vite !</p>
                    </div>
                  ) : (
                    <ul className="mt-5 space-y-2.5">
                      {days.map((d, i) => {
                        const free = freeOn(d);
                        return (
                          <li key={d.toISOString()}>
                            <Reveal delay={Math.min(i, 4) * 60}>
                              <button
                                disabled={!free}
                                onClick={() => { setDay(d); goTo(1); }}
                                className="card-hard press w-full flex items-center gap-4 px-4 py-3 text-left disabled:opacity-45 disabled:shadow-none"
                              >
                                <span className="font-slab text-4xl w-14 text-center text-red">{format(d, 'd')}</span>
                                <span className="flex-1">
                                  <span className="block text-lg font-bold capitalize">{dayWord(d)}</span>
                                  <span className="block text-sm capitalize">{format(d, 'MMMM', { locale: fr })}</span>
                                </span>
                                <span className="text-sm font-bold">{free ? `${free} place${free > 1 ? 's' : ''}` : 'Complet'}</span>
                              </button>
                            </Reveal>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </>
              )}

              {step === 1 && day && (
                <>
                  <p className="mt-1 capitalize">{format(day, 'EEEE d MMMM', { locale: fr })}</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-5">
                    {daySlots.map((s, i) => {
                      const free = isFree(s);
                      return (
                        <button
                          key={s.id}
                          disabled={!free || tearing !== null}
                          onClick={() => pickTicket(s)}
                          className={`notched py-3 text-center bg-navy text-paper disabled:cursor-default ${tearing === s.id ? 'anim-tear' : 'anim-dispense'} ${free ? '' : 'opacity-30'}`}
                          style={{ animationDelay: tearing === s.id ? '0ms' : `${120 + i * 70}ms` }}
                        >
                          <span className="block text-[10px] uppercase tracking-[0.3em]">{free ? 'N°' : s.isBooked ? 'Pris' : 'Passé'}</span>
                          <span className={`font-slab block text-3xl ${free ? '' : 'line-through'}`}>{format(new Date(s.startTime), 'HH:mm')}</span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              {step === 2 && slot && (
                <form onSubmit={handleBook} className="mt-2 space-y-5">
                  <p className="capitalize">{format(new Date(slot.startTime), "EEEE d MMMM 'à' HH:mm", { locale: fr })}</p>
                  <Reveal>
                    <Field label="Prénom" required>
                      <input
                        type="text" value={clientName} onChange={e => setClientName(e.target.value)}
                        autoComplete="given-name" maxLength={100} enterKeyHint="next" required className={inputClass}
                      />
                    </Field>
                  </Reveal>
                  <Reveal delay={90}>
                    <Field label="Téléphone" required>
                      <input
                        type="tel" value={clientPhone} onChange={e => setClientPhone(e.target.value)}
                        autoComplete="tel" enterKeyHint="next" required className={inputClass}
                      />
                    </Field>
                  </Reveal>
                  <Reveal delay={180}>
                    <Field label="Email" hint="facultatif">
                      <input
                        type="email" value={clientEmail} onChange={e => setClientEmail(e.target.value)}
                        autoComplete="email" enterKeyHint="done" className={inputClass}
                      />
                    </Field>
                  </Reveal>
                  {formError && <p key={formError} className="animate-shake text-sm font-bold text-red">{formError}</p>}
                  <Reveal delay={270}>
                    <button
                      disabled={!clientName.trim() || !clientPhone.trim() || submitting}
                      className="press font-slab w-full py-4 text-xl bg-red text-paper shadow-[4px_4px_0_#1c2b4a] flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {submitting && <Loader2 size={20} className="animate-spin" />}
                      Prendre mon ticket
                    </button>
                  </Reveal>
                </form>
              )}

              {step === 3 && booked && (
                <div className="mt-4">
                  <h2 className="font-slab text-4xl text-center">À bientôt !</h2>
                  {/* Fente du distributeur, d'où sort le ticket */}
                  <div className="mt-6 mx-2 h-3 rounded-full bg-navy" />
                  <div className="relative -mt-1.5 mx-4">
                    <div className="notched anim-print px-6 py-7 bg-ticket shadow-[0_12px_30px_-12px_rgba(28,43,74,.4)]">
                      <p className="text-center text-xs font-bold uppercase tracking-[0.35em] text-red">Ticket de passage</p>
                      <p className="font-slab text-center text-6xl mt-3">{format(new Date(booked.slot.startTime), 'HH:mm')}</p>
                      <p className="text-center text-lg font-bold capitalize mt-1">{format(new Date(booked.slot.startTime), 'EEEE d MMMM', { locale: fr })}</p>
                      <div className="my-5 border-t-2 border-dashed border-navy/40" />
                      <div className="flex justify-between text-sm"><span>Au nom de</span><strong>{booked.name}</strong></div>
                      <div className="flex justify-between text-sm mt-1"><span>Chez</span><strong>{SHOP_NAME}</strong></div>
                      <div className="mt-5 h-10" style={{ background: 'repeating-linear-gradient(90deg, #1c2b4a 0 2px, transparent 2px 5px, #1c2b4a 5px 6px, transparent 6px 9px)' }} />
                    </div>
                    <div className="font-slab anim-stamp absolute right-3 bottom-6 px-3 py-1 text-2xl text-red border-4 border-red mix-blend-multiply" style={{ animationDelay: '1.1s' }}>
                      VALIDÉ
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mt-8">
                    <a
                      href={`/api/calendar/${booked.slot.id}`}
                      target="_blank"
                      rel="noopener"
                      className="card-hard press flex items-center justify-center gap-2 py-3 font-bold"
                    >
                      <CalendarPlus size={18} className="text-red" /> Calendrier
                    </a>
                    <button
                      onClick={enableReminder}
                      disabled={reminder !== 'idle'}
                      className="card-hard press flex items-center justify-center gap-2 py-3 font-bold"
                    >
                      {reminder === 'loading' ? <Loader2 size={18} className="animate-spin" />
                        : reminder === 'on' ? <BellRing size={18} className="text-ok" />
                          : <Bell size={18} className="text-red" />}
                      {reminder === 'on' ? 'Rappel activé' : 'Me rappeler'}
                    </button>
                  </div>
                  <p className="text-center text-sm mt-6">
                    Retrouve ou annule ton ticket dans <Link href="/mes-rdv" className="font-bold underline underline-offset-4 text-red">Mes RDV</Link>
                  </p>
                  <button onClick={restart} className="w-full mt-3 py-3 underline underline-offset-4 hover:text-red">
                    Réserver un autre créneau
                  </button>
                </div>
              )}
            </div>

            {/* Téléphone : « Comment ça se passe » sous le choix du jour, qui apparaît au défilement */}
            {step === 0 && (
              <section className="mt-16 lg:hidden">
                <HowItWorks />
              </section>
            )}
          </main>
        </div>
      </div>

      <footer className="lg:hidden safe-bottom px-5 py-8 text-sm bg-navy text-paper">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <span className="font-slab text-lg">{SHOP_NAME}</span>
          <span className="flex gap-4">
            <Link href="/mes-rdv" className="underline underline-offset-4 py-2">Mes RDV</Link>
            <Link href="/admin" className="underline underline-offset-4 py-2">Espace coiffeur</Link>
          </span>
        </div>
      </footer>

      {toasts}
    </div>
  );
}

const inputClass =
  'w-full mt-1 px-3 py-3 text-lg bg-paper-2 border-2 border-navy outline-none transition-shadow focus:shadow-[4px_4px_0_#b3261e]';

function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-bold uppercase tracking-[0.15em]">
        {label}
        {required && <span className="text-red"> *</span>}
        {hint && <span className="normal-case tracking-normal font-normal text-muted"> ({hint})</span>}
      </span>
      {children}
    </label>
  );
}

// Les 3 étapes, en tickets qui apparaissent au défilement
function HowItWorks({ onDark = false }: { onDark?: boolean }) {
  return (
    <>
      <Reveal><h2 className="font-slab text-3xl">Comment ça se passe</h2></Reveal>
      <ol className="mt-5 space-y-4">
        {HOW_IT_WORKS.map(([title, text], i) => (
          <li key={title}>
            <Reveal delay={i * 120}>
              <div className={`notched flex gap-4 items-start px-5 py-4 ${onDark ? 'bg-paper text-navy' : 'bg-navy text-paper'}`}>
                <span className={`font-slab text-4xl leading-none ${onDark ? 'text-red' : 'text-gold'}`}>{i + 1}</span>
                <span>
                  <span className="block font-bold text-lg">{title}</span>
                  <span className="block text-sm opacity-80 mt-0.5">{text}</span>
                </span>
              </div>
            </Reveal>
          </li>
        ))}
      </ol>
    </>
  );
}
