import { NextResponse } from 'next/server';
import { checkPassword, createSessionToken, isAdmin, SESSION_COOKIE, SESSION_MAX_AGE } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Vérifie si la session coiffeur est active
export async function GET() {
    return NextResponse.json({ authenticated: await isAdmin() });
}

// Connexion
export async function POST(request: Request) {
    const { password } = await request.json().catch(() => ({}));

    if (typeof password !== 'string' || !checkPassword(password)) {
        return NextResponse.json({ error: 'Mot de passe incorrect' }, { status: 401 });
    }

    const response = NextResponse.json({ authenticated: true });
    response.cookies.set(SESSION_COOKIE, createSessionToken(), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        maxAge: SESSION_MAX_AGE,
    });
    return response;
}

// Déconnexion
export async function DELETE() {
    const response = NextResponse.json({ authenticated: false });
    response.cookies.delete(SESSION_COOKIE);
    return response;
}
