import { createHmac, timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export const SESSION_COOKIE = 'admin_session';
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 jours

function getSecret() {
    const password = process.env.ADMIN_PASSWORD;
    if (!password) {
        throw new Error('ADMIN_PASSWORD manquant dans les variables d\'environnement');
    }
    // Le secret de signature dépend du mot de passe : changer le mot de passe déconnecte toutes les sessions.
    return process.env.ADMIN_SESSION_SECRET || `session:${password}`;
}

function sign(value: string) {
    return createHmac('sha256', getSecret()).update(value).digest('hex');
}

function safeEqual(a: string, b: string) {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

export function checkPassword(input: string) {
    const password = process.env.ADMIN_PASSWORD;
    if (!password) return false;
    return safeEqual(sign(input), sign(password));
}

export function createSessionToken() {
    const expiresAt = Date.now() + SESSION_MAX_AGE * 1000;
    return `${expiresAt}.${sign(String(expiresAt))}`;
}

function isValidSessionToken(token: string | undefined) {
    if (!token) return false;
    const [expiresAt, signature] = token.split('.');
    if (!expiresAt || !signature) return false;
    if (Number(expiresAt) < Date.now()) return false;
    return safeEqual(signature, sign(expiresAt));
}

export async function isAdmin() {
    const cookieStore = await cookies();
    return isValidSessionToken(cookieStore.get(SESSION_COOKIE)?.value);
}

export function unauthorized() {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
}
