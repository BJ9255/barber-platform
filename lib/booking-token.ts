import { createHash, randomBytes } from 'crypto';

// Code secret remis au client à la réservation, gardé sur son téléphone.
// Il remplace un compte : qui a le code peut voir et annuler ce RDV.
// En base, on ne garde que son empreinte : une fuite de la base ne permet pas d'annuler les RDV des autres.
export function createManageToken() {
    const token = randomBytes(24).toString('base64url');
    return { token, hash: hashManageToken(token) };
}

export function hashManageToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
}

export function isValidTokenFormat(token: unknown): token is string {
    return typeof token === 'string' && /^[A-Za-z0-9_-]{32}$/.test(token);
}
