'use client';

import { useEffect, useRef } from 'react';

// Déclenche une accélération « hyperespace » depuis n'importe quel composant
export function warp(strength = 1) {
    window.dispatchEvent(new CustomEvent('warp', { detail: strength }));
}

const DEPTH = 1000;       // profondeur maximale d'une étoile
const FOCAL = 500;        // distance focale de la projection
const BASE_SPEED = 0.07;  // unités de profondeur par milliseconde
// Traits bleu marine et quelques rouges : les couleurs du ticket, sur le fond crème
const COLORS = ['28,43,74', '28,43,74', '28,43,74', '179,38,30'];
// Fond clair : on garde des traits discrets pour ne pas gêner la lecture
const MAX_ALPHA = 0.45;

type Star = { x: number; y: number; z: number; color: string };

// Fond animé : voyage infini à travers un champ d'étoiles, dessiné à l'encre sur le papier crème
export default function Starfield() {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;

        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        let width = 0;
        let height = 0;
        let dpr = 1;
        let stars: Star[] = [];
        let raf = 0;
        let small = false; // petit écran (téléphone) : étoiles plus denses et plus visibles
        let last = performance.now();

        let speed = BASE_SPEED;
        let boost = 0;
        // Point de fuite : suit légèrement la souris
        let cx = 0, cy = 0, targetCx = 0, targetCy = 0;

        const spawn = (star: Star, far: boolean) => {
            star.x = (Math.random() * 2 - 1) * width;
            star.y = (Math.random() * 2 - 1) * height;
            star.z = far ? DEPTH : Math.random() * DEPTH + 1;
            star.color = COLORS[Math.floor(Math.random() * COLORS.length)];
            return star;
        };

        let starsWidth = 0;
        const resize = () => {
            dpr = Math.min(window.devicePixelRatio || 1, 2);
            width = window.innerWidth;
            height = window.innerHeight;
            canvas.width = width * dpr;
            canvas.height = height * dpr;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.lineCap = 'round';
            targetCx = width / 2;
            targetCy = height / 2;

            // Sur mobile, la barre d'adresse change la hauteur à chaque défilement :
            // on ne recrée les étoiles que si la largeur change (rotation, fenêtre redimensionnée),
            // sinon le champ d'étoiles « sauterait » pendant le scroll.
            if (width !== starsWidth) {
                starsWidth = width;
                cx = targetCx;
                cy = targetCy;
                small = width < 640;
                const count = Math.max(small ? 220 : 160, Math.min(650, Math.round((width * height) / (small ? 1300 : 2600))));
                stars = Array.from({ length: count }, () => spawn({ x: 0, y: 0, z: 0, color: '' }, false));
            }

            // Redimensionner le canvas l'efface : en mouvement réduit, on redessine l'image fixe
            if (reduceMotion) draw(16);
        };

        const project = (x: number, y: number, z: number) => [cx + (x / z) * FOCAL, cy + (y / z) * FOCAL];

        const draw = (dt: number) => {
            ctx.clearRect(0, 0, width, height);

            // Accélération : les boosts retombent en douceur
            boost *= Math.pow(0.992, dt);
            speed += (BASE_SPEED * (1 + boost) - speed) * Math.min(1, dt / 120);
            cx += (targetCx - cx) * Math.min(1, dt / 600);
            cy += (targetCy - cy) * Math.min(1, dt / 600);

            const travel = speed * dt;
            // Plus on va vite, plus les traînées s'allongent
            const trail = Math.min(18, 1 + (speed / BASE_SPEED) * 1.2);

            for (const star of stars) {
                star.z -= travel;
                if (star.z < 1) {
                    spawn(star, true);
                    continue;
                }

                const [sx, sy] = project(star.x, star.y, star.z);
                if (sx < -50 || sx > width + 50 || sy < -50 || sy > height + 50) {
                    spawn(star, true);
                    continue;
                }
                const [px, py] = project(star.x, star.y, Math.min(DEPTH, star.z + travel * trail));

                const closeness = 1 - star.z / DEPTH;
                const alpha = MAX_ALPHA * Math.min(1, small ? 0.15 + closeness * 1.2 : closeness * closeness * 1.4);
                ctx.strokeStyle = `rgba(${star.color},${alpha})`;
                ctx.lineWidth = Math.max(small ? 0.7 : 0.5, closeness * 2.2);
                ctx.beginPath();
                ctx.moveTo(px, py);
                ctx.lineTo(sx, sy);
                ctx.stroke();
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
            boost = Math.max(boost, 22 * strength);
        };

        let lastScroll = window.scrollY;
        const onScroll = () => {
            const delta = Math.abs(window.scrollY - lastScroll);
            lastScroll = window.scrollY;
            boost = Math.min(6, boost + delta * 0.02);
        };

        const onPointer = (e: PointerEvent) => {
            targetCx = width / 2 + (e.clientX - width / 2) * 0.12;
            targetCy = height / 2 + (e.clientY - height / 2) * 0.12;
        };

        resize();
        window.addEventListener('resize', resize);

        // Mouvement réduit : resize() a déjà dessiné une image fixe, pas d'animation
        if (!reduceMotion) {
            raf = requestAnimationFrame(loop);
            window.addEventListener('warp', onWarp);
            window.addEventListener('scroll', onScroll, { passive: true });
            window.addEventListener('pointermove', onPointer, { passive: true });
            // Petite entrée en hyperespace à l'ouverture de la page
            boost = 8;
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
