'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { Download, Share, SquarePlus, X } from 'lucide-react';

// ---------- Détection de la plateforme ----------

export const isIOS = () =>
    typeof navigator !== 'undefined' &&
    (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

// Vrai quand le site est ouvert depuis l'icône de l'écran d'accueil (et pas dans le navigateur)
export const isStandalone = () =>
    typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true);

// ---------- Service worker ----------

export function ServiceWorkerRegister() {
    useEffect(() => {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js').catch(err => console.error('Service worker', err));
        }
    }, []);
    return null;
}

// ---------- Notifications push ----------

export type PushError = 'unsupported' | 'ios-install' | 'denied' | 'not-configured';

export const pushErrorMessage: Record<PushError, string> = {
    'unsupported': 'Ce navigateur ne gère pas les notifications.',
    'ios-install': "Sur iPhone, installe d'abord l'app sur l'écran d'accueil pour recevoir les notifications.",
    'denied': 'Notifications refusées : réactive-les dans les réglages du téléphone.',
    'not-configured': 'Les notifications ne sont pas encore activées sur le serveur.',
};

// La clé VAPID publique arrive en base64url, le navigateur la veut en octets
function urlBase64ToUint8Array(base64: string) {
    const padding = '='.repeat((4 - (base64.length % 4)) % 4);
    const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(raw, c => c.charCodeAt(0));
}

// Demande la permission puis crée (ou réutilise) l'abonnement push de ce téléphone
export async function getPushSubscription(): Promise<PushSubscriptionJSON> {
    const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!key) throw 'not-configured' satisfies PushError;
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        // Safari iOS n'expose l'API push qu'une fois l'app installée
        throw (isIOS() && !isStandalone() ? 'ios-install' : 'unsupported') satisfies PushError;
    }
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') throw 'denied' satisfies PushError;

    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    const subscription = existing ?? await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
    });
    return subscription.toJSON();
}

export async function getExistingPushEndpoint() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
    const registration = await navigator.serviceWorker.getRegistration();
    const sub = await registration?.pushManager.getSubscription();
    return sub?.endpoint ?? null;
}

// ---------- RDV gardés sur ce téléphone (à la place d'un compte) ----------

export type SavedBooking = { token: string; slotId: string; startTime: string; reminder?: boolean };

const STORAGE_KEY = 'lagrobarber:bookings';

export function getSavedBookings(): SavedBooking[] {
    try {
        const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

export function setSavedBookings(bookings: SavedBooking[]) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(bookings));
    } catch {
        // Stockage indisponible (navigation privée) : le RDV reste valable, il ne sera juste pas listé
    }
}

export function saveBooking(booking: SavedBooking) {
    setSavedBookings([...getSavedBookings().filter(b => b.token !== booking.token), booking]);
}

export function updateSavedBooking(token: string, patch: Partial<SavedBooking>) {
    setSavedBookings(getSavedBookings().map(b => (b.token === token ? { ...b, ...patch } : b)));
}

// ---------- Installation de l'app ----------

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

if (typeof window !== 'undefined') {
    // Chrome / Android : on garde l'invitation d'installation pour l'afficher sur notre propre bouton
    window.addEventListener('beforeinstallprompt', e => {
        e.preventDefault();
        deferredPrompt = e as BeforeInstallPromptEvent;
        emit();
    });
    window.addEventListener('appinstalled', () => {
        deferredPrompt = null;
        emit();
    });
}

const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};

// 'android' : invitation native disponible · 'ios' : il faut passer par « Partager » · null : déjà installée ou impossible
function useInstallMode() {
    const canPrompt = useSyncExternalStore(subscribe, () => deferredPrompt !== null, () => false);
    const ios = useSyncExternalStore(subscribe, () => isIOS() && !isStandalone(), () => false);
    return canPrompt ? 'android' : ios ? 'ios' : null;
}

export function InstallButton({ className = '' }: { className?: string }) {
    const mode = useInstallMode();
    const [iosHelp, setIosHelp] = useState(false);

    if (!mode) return null;

    const install = async () => {
        if (mode === 'ios') return setIosHelp(true);
        await deferredPrompt?.prompt();
        deferredPrompt = null;
        emit();
    };

    return (
        <>
            <button onClick={install} className={className}>
                <Download size={16} />
                Installer l&apos;app
            </button>
            {iosHelp && <IosInstallSheet onClose={() => setIosHelp(false)} />}
        </>
    );
}

function IosInstallSheet({ onClose }: { onClose: () => void }) {
    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
            <div className="animate-fade-in absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
            <div role="dialog" aria-modal="true" className="safe-bottom animate-sheet-up relative w-full sm:max-w-md bg-surface border border-line rounded-t-3xl sm:rounded-3xl p-7 pb-10 shadow-2xl">
                <button onClick={onClose} aria-label="Fermer" className="absolute top-4 right-4 size-9 grid place-items-center rounded-full text-muted hover:text-cream hover:bg-surface-2 transition">
                    <X size={18} />
                </button>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/icons/icon-192.png" alt="" className="size-16 rounded-2xl" />
                <h3 className="font-display text-2xl mt-4">Installer Lagrobarber</h3>
                <p className="text-muted text-sm mt-1">En deux gestes, l&apos;app arrive sur ton écran d&apos;accueil.</p>
                <ol className="mt-6 space-y-4">
                    <li className="flex items-center gap-4">
                        <span className="size-10 shrink-0 grid place-items-center rounded-xl bg-surface-2"><Share size={18} className="text-brass" /></span>
                        <span>Appuie sur <strong>Partager</strong> dans la barre de Safari</span>
                    </li>
                    <li className="flex items-center gap-4">
                        <span className="size-10 shrink-0 grid place-items-center rounded-xl bg-surface-2"><SquarePlus size={18} className="text-brass" /></span>
                        <span>Choisis <strong>Sur l&apos;écran d&apos;accueil</strong></span>
                    </li>
                </ol>
            </div>
        </div>
    );
}
