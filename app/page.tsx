'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { addDays, addWeeks, format, isSameDay, isToday, isTomorrow, startOfDay } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ArrowLeft, ArrowRight, Bell, BellRing, CalendarPlus, Loader2, Sparkles, Ticket } from 'lucide-react';
import { BarberPole, Logo, Reveal, SERVICES, SHOP_NAME, useToasts } from './components/ui';
import { warp } from './components/TicketRain';
import { generateClientDemoSlots } from './admin/demo';
import {
  InstallButton, useInstallMode, getPushSubscription, pushErrorMessage, saveBooking, updateSavedBooking, type PushError,
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
const shortDay = (d: Date) => (isToday(d) ? 'Auj.' : isTomorrow(d) ? 'Dem.' : format(d, 'EEE', { locale: fr }));

// Trois écrans : choisir un créneau, donner ses coordonnées, ticket confirmé
type Step = 'choose' | 'details' | 'done';

const HOW_IT_WORKS = [
  ['Choisis un jour et une heure', 'Seules les heures encore libres sont affichées.'],
  ['Donne ton prénom et ton téléphone', 'Pas de compte à créer, pas de mot de passe.'],
  ['C’est réservé', 'Ton ticket est confirmé tout de suite et reste dans « Mes RDV ».'],
];

export default function BookingPage() {
  const [slots, setSlots] = useState<Slot[] | undefined>(undefined);
  const [step, setStep] = useState<Step>('choose');
  const [day, setDay] = useState<Date | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);

  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const [booked, setBooked] = useState<{ slot: Slot; name: string; token: string } | null>(null);
  const [reminder, setReminder] = useState<'idle' | 'loading' | 'on'>('idle');

  // Mode démo (/?demo) : créneaux fictifs, réservation simulée, aucune requête au serveur
  const [demo, setDemo] = useState(false);
  // Téléphone : une page d'accueil (enseigne + fonctionnement) avant l'écran de réservation.
  // Vue une fois par visite : en revenant de « Mes RDV », on retombe directement sur la réservation.
  const [intro, setIntro] = useState(true);
  const [slideIn, setSlideIn] = useState(false);
  useEffect(() => {
    try {
      if (sessionStorage.getItem('lagrobarber-intro')) setIntro(false);
    } catch { /* stockage indisponible : on affiche l'accueil */ }
  }, []);
  const leaveIntro = () => {
    try { sessionStorage.setItem('lagrobarber-intro', '1'); } catch { /* ignoré */ }
    setIntro(false);
    setSlideIn(true);
    warp(0.8);
    window.scrollTo({ top: 0 });
  };

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

  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('demo')) {
      setDemo(true);
      setSlots(generateClientDemoSlots());
      return;
    }
    fetchSlots();
  }, [fetchSlots]);

  const today = startOfDay(new Date());
  const days = Array.from({ length: DAYS_AHEAD }, (_, i) => addDays(today, i));
  const freeOn = (d: Date) => (slots ?? []).filter(s => isFree(s) && isSameDay(new Date(s.startTime), d));
  // Jour affiché : celui choisi, sinon le premier jour qui a encore de la place
  const firstFreeDay = days.find(d => freeOn(d).length > 0) ?? null;
  const activeDay = day ?? firstFreeDay;
  const times = activeDay ? freeOn(activeDay) : [];

  const goTo = (next: Step, strength = 0.5) => {
    setStep(next);
    warp(strength);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const chooseDay = (d: Date) => {
    setDay(d);
    setSlot(null);
  };

  const handleBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slot || !clientName.trim() || !clientPhone.trim()) return;

    setSubmitting(true);
    setFormError('');
    if (demo) {
      // Démo : le créneau passe simplement à « pris » dans la page, rien n'est enregistré
      await new Promise(r => setTimeout(r, 600));
      setSlots(prev => prev?.map(s => (s.id === slot.id ? { ...s, isBooked: true } : s)));
      setBooked({ slot, name: clientName.trim(), token: 'demo' });
      setReminder('idle');
      setClientName('');
      setClientPhone('');
      setClientEmail('');
      setSlot(null);
      setSubmitting(false);
      goTo('done', 1.6);
      return;
    }
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
        setSlot(null);
        goTo('done', 1.6);
        fetchSlots();
      } else if (res.status === 409) {
        // Quelqu'un a été plus rapide : retour au choix de l'heure, avec les créneaux à jour
        notify(data.error || 'Ce créneau vient d’être réservé', 'error');
        setSlot(null);
        fetchSlots();
        goTo('choose');
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
    if (demo) return notify('Les rappels ne sont pas disponibles en démo', 'error');
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
    goTo('choose');
  };

  const noSlotsAtAll = slots !== undefined && !firstFreeDay;

  return (
    <div className="min-h-dvh overflow-x-clip flex flex-col">
      {/* Téléphone : barre fine et fixe, toujours à portée de pouce */}
      <header className={`safe-top lg:hidden sticky top-0 z-40 bg-navy/95 backdrop-blur border-b-2 border-red ${intro ? 'hidden' : ''}`}>
        <div className="max-w-md mx-auto px-4 h-14 flex items-center justify-between gap-2">
          <Logo light />
          <nav className="flex items-center gap-1 text-sm">
            <InstallButton className="press flex items-center gap-1.5 px-2.5 py-1 border-2 border-paper/60 font-bold" />
            <Link href="/mes-rdv" className="flex items-center gap-1.5 px-2 py-2 min-h-10 font-bold hover:text-gold transition">
              <Ticket size={16} /> Mes RDV
            </Link>
          </nav>
        </div>
      </header>

      {demo && (
        <div className="bg-gold text-navy text-sm font-bold">
          <div className="max-w-md lg:max-w-none mx-auto px-4 py-2 flex items-center justify-center gap-2 text-center">
            <Sparkles size={15} className="shrink-0" />
            <span>Démo client : créneaux fictifs, rien n&apos;est enregistré.</span>
            <Link href="/demo" className="underline underline-offset-2 shrink-0">Changer</Link>
          </div>
        </div>
      )}

      {/* Ordinateur : deux colonnes, l'enseigne reste fixe à gauche pendant le défilement */}
      <div className="flex-1 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        {/* Téléphone : page d'accueil plein écran. Ordinateur : colonne de gauche fixe */}
        <aside className={`${intro ? 'flex' : 'hidden'} lg:flex flex-col justify-center safe-top min-h-dvh px-6 py-10 lg:sticky lg:top-0 lg:h-dvh lg:min-h-0 lg:px-14 xl:px-20 lg:py-12 bg-navy`}>
          <div className="anim-swing flex items-center justify-center gap-4 lg:gap-8 text-center">
            <BarberPole size="lg" light />
            <div>
              <p className="text-xs lg:text-sm font-bold uppercase tracking-[0.3em] text-gold">Barbier · sur rendez-vous</p>
              <h1 className="font-slab text-[38px] sm:text-[48px] xl:text-[62px] leading-none mt-2 lg:mt-3">{SHOP_NAME}</h1>
              <p className="text-sm lg:text-lg mt-2 lg:mt-4">{SERVICES}</p>
            </div>
            <BarberPole size="lg" light />
          </div>
          <div className="mt-10 lg:mt-14">
            <HowItWorks onDark />
            {/* Téléphone : on passe à l'écran de réservation */}
            <button
              onClick={leaveIntro}
              className="lg:hidden press font-slab mt-8 w-full py-4 flex items-center justify-center gap-3 text-xl bg-red text-paper shadow-[4px_4px_0_rgba(0,0,0,.45)]"
            >
              Continuer <ArrowRight size={22} />
            </button>
            <nav className="mt-8 lg:mt-10 flex flex-wrap items-center justify-center lg:justify-start gap-x-6 gap-y-3 text-sm">
              <Link href="/mes-rdv" className="underline underline-offset-4 hover:text-gold transition">Mes RDV</Link>
              <Link href="/admin" className="underline underline-offset-4 hover:text-gold transition">Espace coiffeur</Link>
              <Link href="/demo" className="underline underline-offset-4 hover:text-gold transition">Démo</Link>
              <InstallButton className="press flex items-center gap-1.5 px-3 py-1.5 border-2 border-paper font-bold hover:bg-paper hover:text-navy" />
            </nav>
          </div>
        </aside>

        <main className={`px-4 pt-7 lg:px-14 lg:py-16 ${step === 'choose' && slot ? 'pb-32 lg:pb-16' : 'pb-14'} ${intro ? 'hidden lg:block' : ''} ${slideIn ? 'anim-from-right lg:animate-none' : ''}`}>
          <div className="max-w-md mx-auto lg:max-w-xl lg:mx-0">
            {step === 'choose' && (
              <div key="choose" className="anim-pop">
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold">{SERVICES}</p>
                <h2 className="font-slab text-[34px] lg:text-5xl leading-none mt-2">Réserve ta coupe</h2>
                <p className="text-sm mt-3 opacity-85">Choisis un jour, puis une heure. C&apos;est confirmé tout de suite, sans créer de compte.</p>

                {noSlotsAtAll ? (
                  <SoldOut />
                ) : (
                  <>
                    <StepLabel n={1}>Choisis un jour</StepLabel>
                    {/* Bande de jours qui défile horizontalement, comme un carnet de tickets */}
                    <div className="-mx-4 px-4 lg:mx-0 lg:px-0 flex gap-2 overflow-x-auto snap-x pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                      {slots === undefined
                        ? Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton animate-shimmer opacity-20 shrink-0 w-[62px] h-[86px]" />)
                        : days.map(d => {
                          const free = freeOn(d).length;
                          const selected = activeDay && isSameDay(d, activeDay);
                          return (
                            <button
                              key={d.toISOString()}
                              onClick={() => chooseDay(d)}
                              disabled={!free}
                              aria-pressed={!!selected}
                              className={`snap-start shrink-0 w-[62px] py-2 flex flex-col items-center border-2 transition-colors disabled:opacity-30 ${selected
                                ? 'bg-ticket border-ticket text-navy'
                                : 'border-paper/25 hover:border-paper/60'
                                }`}
                            >
                              <span className="text-[11px] font-bold uppercase tracking-wider">{shortDay(d)}</span>
                              <span className={`font-slab text-[26px] leading-tight ${selected ? 'text-red' : ''}`}>{format(d, 'd')}</span>
                              <span className={`text-[10px] font-bold ${selected ? 'text-red' : free ? 'text-gold' : ''}`}>
                                {free ? `${free} dispo` : '—'}
                              </span>
                            </button>
                          );
                        })}
                    </div>

                    <StepLabel n={2}>
                      Choisis une heure
                      {activeDay && <span className="hidden sm:inline normal-case tracking-normal font-normal opacity-70"> · <span className="capitalize">{dayWord(activeDay)}</span> {format(activeDay, 'd MMMM', { locale: fr })}</span>}
                    </StepLabel>
                    {slots === undefined ? (
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
                        {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton animate-shimmer opacity-20 h-14" />)}
                      </div>
                    ) : (
                      <div key={activeDay?.toISOString()} className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
                        {times.map((s, i) => {
                          const selected = slot?.id === s.id;
                          return (
                            <button
                              key={s.id}
                              onClick={() => { setSlot(selected ? null : s); setFormError(''); }}
                              aria-pressed={selected}
                              className={`notched anim-dispense py-3 font-slab text-2xl transition-colors ${selected ? 'bg-red text-paper' : 'bg-ticket hover:bg-gold'}`}
                              style={{ animationDelay: `${i * 40}ms` }}
                            >
                              {format(new Date(s.startTime), 'HH:mm')}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* Ordinateur : le créneau choisi et le bouton, sous la grille */}
                    {slot && <div className="hidden lg:block mt-8"><ContinueBar slot={slot} onContinue={() => goTo('details')} /></div>}
                  </>
                )}

              </div>
            )}

            {step === 'details' && slot && (
              <form key="details" onSubmit={handleBook} className="anim-from-right space-y-5">
                <button type="button" onClick={() => goTo('choose')} className="flex items-center gap-2 text-sm font-bold py-2 -my-2 hover:text-gold transition">
                  <ArrowLeft size={16} /> Changer d&apos;heure
                </button>
                <h2 className="font-slab text-[34px] lg:text-5xl leading-none">Tes coordonnées</h2>

                {/* Récapitulatif du créneau, sous forme de ticket */}
                <div className="notched bg-ticket px-6 py-4 flex items-center gap-4">
                  <span className="font-slab text-4xl text-red">{format(new Date(slot.startTime), 'HH:mm')}</span>
                  <span className="flex-1 font-bold leading-tight first-letter:uppercase">
                    {format(new Date(slot.startTime), 'EEEE d MMMM', { locale: fr })}
                    <span className="block text-sm font-normal">Chez {SHOP_NAME}</span>
                  </span>
                  <button type="button" onClick={() => goTo('choose')} className="text-sm font-bold underline underline-offset-4 hover:text-red">
                    Modifier
                  </button>
                </div>

                <Field label="Prénom" required>
                  <input
                    type="text" value={clientName} onChange={e => setClientName(e.target.value)}
                    autoComplete="given-name" maxLength={100} enterKeyHint="next" required className={inputClass}
                  />
                </Field>
                <Field label="Téléphone" hint="en cas d’imprévu" required>
                  <input
                    type="tel" value={clientPhone} onChange={e => setClientPhone(e.target.value)}
                    autoComplete="tel" enterKeyHint="next" required className={inputClass}
                  />
                </Field>
                <Field label="Email" hint="facultatif">
                  <input
                    type="email" value={clientEmail} onChange={e => setClientEmail(e.target.value)}
                    autoComplete="email" enterKeyHint="done" className={inputClass}
                  />
                </Field>
                {formError && <p key={formError} className="animate-shake text-sm font-bold text-gold">{formError}</p>}
                <button
                  disabled={!clientName.trim() || !clientPhone.trim() || submitting}
                  className="press font-slab w-full py-4 text-xl bg-red text-paper shadow-[4px_4px_0_rgba(0,0,0,.45)] flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {submitting && <Loader2 size={20} className="animate-spin" />}
                  Confirmer ma réservation
                </button>
                <p className="text-xs text-center opacity-70">Tu pourras annuler à tout moment depuis « Mes RDV ».</p>
              </form>
            )}

            {step === 'done' && booked && (
              <div key="done" className="anim-pop">
                <h2 className="font-slab text-4xl text-center">C&apos;est réservé !</h2>
                <p className="text-center text-sm mt-2 opacity-85">À bientôt chez {SHOP_NAME}.</p>
                {/* Fente du distributeur, d'où sort le ticket */}
                <div className="mt-6 mx-2 h-3 rounded-full bg-black/40" />
                <div className="relative -mt-1.5 mx-4">
                  <div className="notched anim-print px-6 py-7 bg-ticket shadow-[0_12px_30px_-12px_rgba(0,0,0,.6)]">
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
                    href={demo ? undefined : `/api/calendar/${booked.slot.id}`}
                    onClick={demo ? () => notify("L'ajout au calendrier n'est pas disponible en démo", 'error') : undefined}
                    target="_blank"
                    rel="noopener"
                    className="card-hard press flex items-center justify-center gap-2 py-3 font-bold cursor-pointer"
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
                  Retrouve ou annule ton ticket dans <Link href="/mes-rdv" className="font-bold underline underline-offset-4 text-gold">Mes RDV</Link>
                </p>
                <button onClick={restart} className="w-full mt-3 py-3 underline underline-offset-4 hover:text-gold">
                  Réserver un autre créneau
                </button>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Téléphone : le créneau choisi reste collé en bas de l'écran, hors des blocs animés
          (un parent animé avec « transform » empêcherait la barre de rester fixe) */}
      {step === 'choose' && slot && (
        <div className="lg:hidden anim-sheet-up fixed bottom-0 inset-x-0 z-40 safe-bottom bg-night/95 backdrop-blur border-t-2 border-paper/15">
          <div className="max-w-md mx-auto px-4 py-3">
            <ContinueBar slot={slot} onContinue={() => goTo('details')} />
          </div>
        </div>
      )}

      <footer className={`lg:hidden safe-bottom px-5 py-8 text-sm bg-navy ${intro ? 'hidden' : ''}`}>
        <div className="max-w-md mx-auto flex items-center justify-between">
          <span className="font-slab text-lg">{SHOP_NAME}</span>
          <span className="flex gap-4">
            <Link href="/mes-rdv" className="underline underline-offset-4 py-2">Mes RDV</Link>
            <Link href="/admin" className="underline underline-offset-4 py-2">Coiffeur</Link>
            <Link href="/demo" className="underline underline-offset-4 py-2">Démo</Link>
          </span>
        </div>
      </footer>

      {toasts}
    </div>
  );
}

// Créneau choisi + bouton pour passer aux coordonnées
function ContinueBar({ slot, onContinue }: { slot: Slot; onContinue: () => void }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-xs opacity-75 first-letter:uppercase truncate">{format(new Date(slot.startTime), 'EEEE d MMMM', { locale: fr })}</p>
        <p className="font-slab text-2xl leading-tight">{format(new Date(slot.startTime), 'HH:mm')}</p>
      </div>
      <button
        onClick={onContinue}
        className="press font-slab shrink-0 flex items-center gap-2 px-6 py-3.5 text-lg bg-red text-paper shadow-[4px_4px_0_rgba(0,0,0,.45)]"
      >
        Continuer <ArrowRight size={20} />
      </button>
    </div>
  );
}

// Petit intitulé numéroté au-dessus de chaque choix : on sait toujours quoi faire ensuite
function StepLabel({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <p className="mt-8 mb-3 flex items-center gap-2.5 text-sm font-bold uppercase tracking-[0.15em]">
      <span className="size-6 shrink-0 grid place-items-center bg-gold text-navy font-slab text-sm tracking-normal">{n}</span>
      <span>{children}</span>
    </p>
  );
}

const inputClass =
  'w-full mt-1.5 px-3 py-3 text-lg bg-paper-2 border-2 border-paper-2 outline-none transition-shadow focus:shadow-[4px_4px_0_#b3261e]';

function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-bold uppercase tracking-[0.15em]">
        {label}
        {required && <span className="text-gold"> *</span>}
        {hint && <span className="normal-case tracking-normal font-normal opacity-70"> ({hint})</span>}
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

// Aucun créneau à venir : un distributeur de tickets vide, tamponné « complet », et de quoi ne pas repartir les mains vides
function SoldOut() {
  const installable = useInstallMode();
  return (
    <div className="mt-8">
      <div className="relative">
        {/* Fente du distributeur : un ticket vierge dépasse, rentre et ressort */}
        <div className="h-3 rounded-full bg-black/40" />
        <div className="mx-6 -mt-1.5 h-24 overflow-hidden">
          <div className="anim-peek notched mx-auto w-full h-full bg-ticket flex items-end justify-start pl-5 pb-3">
            <span className="text-xs font-bold uppercase tracking-[0.35em] text-muted">Bientôt</span>
          </div>
        </div>
        <div className="font-slab anim-stamp absolute -right-1 top-14 px-3 py-0.5 text-2xl text-red border-4 border-red bg-ticket/80" style={{ animationDelay: '0.4s' }}>
          COMPLET
        </div>
      </div>

      <h3 className="font-slab text-2xl text-center mt-6">Tout est pris pour l&apos;instant</h3>
      <p className="text-center text-sm mt-2 opacity-85">
        Les nouveaux créneaux sont ouverts au fil de la semaine, souvent la veille pour le lendemain.
      </p>

      <ul className="mt-6 border-t-2 border-dashed border-paper/20 divide-y-2 divide-dashed divide-paper/15 text-sm">
        {installable && (
          <li className="flex items-center gap-3 py-3">
            <Bell size={18} className="text-gold shrink-0" />
            <span className="flex-1">Installe l&apos;app pour revenir en un geste.</span>
            <InstallButton className="press shrink-0 flex items-center gap-1.5 px-3 py-1.5 border-2 border-paper font-bold" />
          </li>
        )}
        <li className="flex items-center gap-3 py-3">
          <Ticket size={18} className="text-gold shrink-0" />
          <span className="flex-1">Déjà un ticket ? Retrouve-le ou annule-le.</span>
          <Link href="/mes-rdv" className="shrink-0 font-bold underline underline-offset-4 hover:text-gold py-1">Mes RDV</Link>
        </li>
      </ul>
    </div>
  );
}
