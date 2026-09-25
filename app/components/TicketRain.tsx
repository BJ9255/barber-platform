'use client';

import { useEffect, useRef } from 'react';

// Déclenche un « coup de vent » sur les tickets depuis n'importe quel composant
export function warp(strength = 1) {
    window.dispatchEvent(new CustomEvent('warp', { detail: strength }));
}

const PAPER = '#fffaf0';
const NAVY = '#1c2b4a';
const RED = '#b3261e';
const GOLD = '#e8b04a';

const TICKET_W = 64;       // taille d'un ticket au premier plan, en px CSS
const TICKET_H = 30;
const FALL_SPEED = 0.035;  // px par milliseconde au premier plan
const LABELS = ['COUPE', 'BARBE', 'DÉGRADÉ', 'ENTRÉE', 'TICKET'];

// Trois modèles de ticket, aux couleurs du thème
const STYLES = [
    { bg: PAPER, ink: NAVY, stub: RED, stubInk: PAPER },
    { bg: PAPER, ink: NAVY, stub: RED, stubInk: PAPER },
    { bg: NAVY, ink: PAPER, stub: GOLD, stubInk: NAVY },
    { bg: RED, ink: PAPER, stub: PAPER, stubInk: RED },
];

type Ticket = {
    x: number; y: number;
    depth: number;   // 0.35 (loin) → 1 (près) : taille, vitesse, opacité, parallaxe
    angle: number; spin: number;
    flip: number; flipSpeed: number;  // le ticket tourne sur lui-même en tombant
    sway: number; swaySpeed: number;  // balancement de gauche à droite
    sprite: number;
};

// Dessine un ticket prédécoupé (encoches, pointillés, talon numéroté) dans un petit canvas réutilisé à chaque image
function makeSprite(style: typeof STYLES[number], label: string, num: number, font: string, dpr: number) {
    const scale = dpr * 2; // net même au premier plan
    const c = document.createElement('canvas');
    c.width = TICKET_W * scale;
    c.height = TICKET_H * scale;
    const g = c.getContext('2d')!;
    g.scale(scale, scale);
    const w = TICKET_W, h = TICKET_H, stubX = w * 0.7, r = 4.5;

    g.fillStyle = style.bg;
    g.fillRect(0, 0, w, h);
    g.fillStyle = style.stub;
    g.fillRect(stubX, 0, w - stubX, h);

    // Cadre intérieur fin, comme sur les tickets imprimés
    g.strokeStyle = style.ink;
    g.globalAlpha = 0.55;
    g.lineWidth = 0.8;
    g.strokeRect(3, 3, stubX - 6, h - 6);
    g.globalAlpha = 1;

    // Ligne de découpe en pointillés entre le ticket et le talon
    g.setLineDash([2, 2]);
    g.strokeStyle = style.ink;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(stubX, 2);
    g.lineTo(stubX, h - 2);
    g.stroke();
    g.setLineDash([]);

    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = style.ink;
    g.font = `bold 8px ${font}`;
    g.fillText(label, stubX / 2, h / 2 - 4);
    g.font = `6px ${font}`;
    g.fillText('LAGROBARBER', stubX / 2, h / 2 + 5);

    g.save();
    g.translate(stubX + (w - stubX) / 2, h / 2);
    g.rotate(-Math.PI / 2);
    g.fillStyle = style.stubInk;
    g.font = `bold 7px ${font}`;
    g.fillText(`N°${String(num).padStart(3, '0')}`, 0, 0);
    g.restore();

    // Encoches rondes sur les côtés : on découpe le papier
    g.globalCompositeOperation = 'destination-out';
    for (const [x, y] of [[0, h / 2], [w, h / 2], [stubX, 0], [stubX, h]]) {
        g.beginPath();
        g.arc(x, y, x === stubX ? 2.5 : r, 0, Math.PI * 2);
        g.fill();
    }
    g.globalCompositeOperation = 'source-over';
    return c;
}

// Fond animé : des tickets de barbier qui tombent en virevoltant sur le papier crème
export default function TicketRain() {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;

        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        let width = 0, height = 0, dpr = 1;
        let small = false; // téléphone : moins de tickets et plus pâles, pour que le contenu reste lisible
        let tickets: Ticket[] = [];
        let sprites: HTMLCanvasElement[] = [];
        let raf = 0;
        let last = performance.now();

        let boost = 0;  // accélération de la chute, retombe en douceur
        let wind = 0;   // poussée horizontale d'un coup de vent
        let scrollShift = 0;  // les tickets glissent avec le défilement (parallaxe)
        // Décalage de parallaxe : suit légèrement la souris
        let px = 0, py = 0, targetPx = 0, targetPy = 0;

        const buildSprites = () => {
            const font = getComputedStyle(document.body).getPropertyValue('--font-type').trim() || '"Courier New", monospace';
            sprites = Array.from({ length: 12 }, (_, i) =>
                makeSprite(STYLES[i % STYLES.length], LABELS[i % LABELS.length], 7 + i * 37 % 900, font, dpr));
        };

        const spawn = (t: Ticket, anywhere: boolean) => {
            t.depth = 0.35 + Math.pow(Math.random(), 1.6) * 0.65; // davantage de tickets au loin
            t.x = Math.random() * (width + 120) - 60;
            t.y = anywhere ? Math.random() * height : -TICKET_W - Math.random() * height * 0.3;
            t.angle = Math.random() * Math.PI * 2;
            t.spin = (Math.random() - 0.5) * 0.0012;
            t.flip = Math.random() * Math.PI * 2;
            t.flipSpeed = 0.0012 + Math.random() * 0.0022;
            t.sway = Math.random() * Math.PI * 2;
            t.swaySpeed = 0.0006 + Math.random() * 0.0008;
            t.sprite = Math.floor(Math.random() * sprites.length);
            return t;
        };

        let ticketsWidth = 0;
        const resize = () => {
            dpr = Math.min(window.devicePixelRatio || 1, 2);
            width = window.innerWidth;
            height = window.innerHeight;
            canvas.width = width * dpr;
            canvas.height = height * dpr;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            targetPx = targetPy = 0;

            // Sur mobile, la barre d'adresse change la hauteur à chaque défilement :
            // on ne recrée les tickets que si la largeur change, sinon ils « sauteraient ».
            if (width !== ticketsWidth) {
                ticketsWidth = width;
                buildSprites();
                small = width < 640;
                const count = small ? 7 : Math.max(18, Math.min(46, Math.round((width * height) / 26000)));
                tickets = Array.from({ length: count }, () => spawn({} as Ticket, true));
            }
        };

        const draw = (dt: number) => {
            ctx.clearRect(0, 0, width, height);

            boost *= Math.pow(0.994, dt);
            wind *= Math.pow(0.996, dt);
            px += (targetPx - px) * Math.min(1, dt / 500);
            py += (targetPy - py) * Math.min(1, dt / 500);
            const shift = scrollShift;
            scrollShift = 0;
            // « Réduire les animations » : les tickets dérivent lentement, sans tourner ni virevolter
            const speed = reduceMotion ? 0.35 : 1 + boost;

            // Du plus loin au plus proche, pour que les tickets proches passent devant
            tickets.sort((a, b) => a.depth - b.depth);
            for (const t of tickets) {
                t.y += FALL_SPEED * t.depth * speed * dt - shift * t.depth * 0.35;
                t.x += wind * t.depth * dt;
                t.angle += t.spin * speed * dt;
                if (!reduceMotion) {
                    t.flip += t.flipSpeed * Math.min(4, speed) * dt;
                    t.sway += t.swaySpeed * dt;
                }

                const margin = TICKET_W;
                if (t.y > height + margin) { spawn(t, false); continue; }
                if (t.y < -margin * 3) t.y = height + margin * 0.9;
                if (t.x > width + margin) t.x = -margin;
                if (t.x < -margin) t.x = width + margin;

                const x = t.x + Math.sin(t.sway) * 22 * t.depth + px * t.depth;
                const y = t.y + py * t.depth;
                const s = t.depth;
                const turn = Math.cos(t.flip); // le ticket vu de face (1) puis par la tranche (0)

                ctx.save();
                ctx.globalAlpha = small ? 0.08 + s * s * 0.2 : 0.18 + s * s * 0.5;
                ctx.translate(x, y);
                ctx.rotate(t.angle + Math.sin(t.sway) * 0.35);
                ctx.scale(s, s * Math.max(0.08, Math.abs(turn)));
                // Ombre dure décalée, comme les cartes du site
                ctx.globalAlpha *= 0.35;
                ctx.fillStyle = NAVY;
                ctx.fillRect(-TICKET_W / 2 + 3, -TICKET_H / 2 + 3, TICKET_W, TICKET_H);
                ctx.globalAlpha /= 0.35;
                ctx.drawImage(sprites[t.sprite], -TICKET_W / 2, -TICKET_H / 2, TICKET_W, TICKET_H);
                ctx.restore();
            }
        };

        const loop = (now: number) => {
            const dt = Math.min(50, now - last);
            last = now;
            draw(dt);
            raf = requestAnimationFrame(loop);
        };

        const onWarp = (e: Event) => {
            const strength = (e as CustomEvent<number>).detail ?? 1;
            boost = Math.max(boost, 7 * strength);
            wind = (Math.random() < 0.5 ? -1 : 1) * 0.18 * strength;
        };

        let lastScroll = window.scrollY;
        const onScroll = () => {
            const delta = window.scrollY - lastScroll;
            lastScroll = window.scrollY;
            scrollShift += delta;
        };

        const onPointer = (e: PointerEvent) => {
            targetPx = (e.clientX - width / 2) * -0.04;
            targetPy = (e.clientY - height / 2) * -0.04;
        };

        resize();
        window.addEventListener('resize', resize);
        // La police machine à écrire arrive parfois après le premier dessin : on refait les tickets
        document.fonts?.ready.then(buildSprites);

        raf = requestAnimationFrame(loop);
        if (!reduceMotion) {
            window.addEventListener('warp', onWarp);
            window.addEventListener('scroll', onScroll, { passive: true });
            window.addEventListener('pointermove', onPointer, { passive: true });
            // Petite averse de tickets à l'ouverture de la page
            boost = 4;
        }

        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener('resize', resize);
            window.removeEventListener('warp', onWarp);
            window.removeEventListener('scroll', onScroll);
            window.removeEventListener('pointermove', onPointer);
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            aria-hidden
            className="fixed inset-0 -z-10 h-full w-full pointer-events-none"
        />
    );
}
