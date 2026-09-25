// Données fictives du mode démo (/admin?demo) : tout reste dans le navigateur,
// aucune requête n'est envoyée à la base de données.

const CLIENTS: [string, string, string | null][] = [
    ['Thomas', '06 12 48 93 27', 'thomas.r@exemple.fr'],
    ['Yanis', '07 81 22 90 14', null],
    ['Lucas', '06 45 98 12 03', 'lucas.m@exemple.fr'],
    ['Inès', '06 77 01 45 66', null],
    ['Mehdi', '07 58 34 21 90', 'mehdi.b@exemple.fr'],
    ['Hugo', '06 33 70 18 52', null],
    ['Nathan', '06 91 05 64 37', 'nathan.d@exemple.fr'],
    ['Adam', '07 20 46 88 11', null],
];

const HOURS = [9.5, 10.5, 11.5, 14, 15, 16, 17, 18];

export type DemoSlot = {
    id: string;
    startTime: string;
    isBooked: boolean;
    clientName: string | null;
    clientPhone: string | null;
    clientEmail: string | null;
};

export function generateDemoSlots(): DemoSlot[] {
    const slots: DemoSlot[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let client = 0;

    for (let d = 0; d < 8; d++) {
        const day = new Date(today);
        day.setDate(today.getDate() + d);
        if (day.getDay() === 0) continue; // fermé le dimanche

        HOURS.forEach((h, i) => {
            const start = new Date(day);
            start.setHours(Math.floor(h), (h % 1) * 60);
            // Motif pseudo-aléatoire mais stable : environ un créneau sur deux réservé
            const booked = (d * 7 + i * 3) % 5 < 2 || (d === 0 && i % 2 === 1);
            const c = CLIENTS[client % CLIENTS.length];
            if (booked) client++;
            slots.push({
                id: `demo-${d}-${i}`,
                startTime: start.toISOString(),
                isBooked: booked,
                clientName: booked ? c[0] : null,
                clientPhone: booked ? c[1] : null,
                clientEmail: booked ? c[2] : null,
            });
        });
    }

    // Toujours au moins un prochain client à afficher
    const now = Date.now();
    if (!slots.some(s => s.isBooked && new Date(s.startTime).getTime() > now)) {
        const next = slots.find(s => new Date(s.startTime).getTime() > now);
        if (next) Object.assign(next, { isBooked: true, clientName: 'Thomas', clientPhone: CLIENTS[0][1], clientEmail: CLIENTS[0][2] });
    }

    return slots;
}

// Même planning fictif, vu par un client (/?demo) : seulement l'heure et libre / pris
export function generateClientDemoSlots() {
    return generateDemoSlots().map(({ id, startTime, isBooked }) => ({ id, startTime, isBooked }));
}
