'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Trash2, Plus, Calendar, Loader2 } from 'lucide-react';

type Slot = {
    id: string;
    startTime: string;
    isBooked: boolean;
    clientName?: string;
};

export default function AdminPage() {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [password, setPassword] = useState('');
    const [slots, setSlots] = useState<Slot[]>([]);
    const [loading, setLoading] = useState(false);

    // New slot form
    const [newDate, setNewDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [newTime, setNewTime] = useState('10:00');

    useEffect(() => {
        // Check if previously authenticated (simple local storage)
        if (localStorage.getItem('adminAuth') === 'true') {
            setIsAuthenticated(true);
            fetchSlots();
        }
    }, []);

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        // HARDCODED PASSWORD FOR MVP - CHANGE THIS!
        if (password === 'coiffeur123') {
            setIsAuthenticated(true);
            localStorage.setItem('adminAuth', 'true');
            fetchSlots();
        } else {
            alert('Mot de passe incorrect');
        }
    };

    const fetchSlots = async () => {
        setLoading(true);
        try {
            // Fetch all future slots, or just a broad range?
            // Let's fetch next 4 weeks for admin view
            const start = new Date();
            const res = await fetch(`/api/slots?scope=future`); // Fetch all upcoming slots
            if (res.ok) {
                const data = await res.json();
                setSlots(data);
            }
        } catch (error) {
            console.error('Failed to fetch', error);
        } finally {
            setLoading(false);
        }
    };

    const handleAddSlot = async () => {
        if (!newDate || !newTime) return;

        try {
            const dateTime = new Date(`${newDate}T${newTime}`);
            const res = await fetch('/api/slots', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ startTime: dateTime })
            });

            if (res.ok) {
                fetchSlots();
                alert('Créneau ajouté !');
            } else {
                alert('Erreur lors de l\'ajout');
            }
        } catch (error) {
            console.error(error);
        }
    };

    const handleDeleteSlot = async (id: string) => {
        // Need a delete API endpoint. 
        // For now, let's assume we will add DELETE to /api/slots or specific route.
        // I'll update api/slots/route.ts to handle DELETE.
        const res = await fetch(`/api/slots?id=${id}`, { method: 'DELETE' });
        if (res.ok) {
            setSlots(slots.filter(s => s.id !== id));
        } else {
            alert('Impossible de supprimer (peut-être déjà réservé ?)');
        }
    };

    if (!isAuthenticated) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
                <form onSubmit={handleLogin} className="bg-white p-8 rounded-xl shadow-md space-y-4 w-full max-w-sm">
                    <h1 className="text-xl font-bold text-center">Accès Coiffeur</h1>
                    <input
                        type="password"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        className="w-full border p-2 rounded"
                        placeholder="Mot de passe"
                    />
                    <button type="submit" className="w-full bg-black text-white p-2 rounded">Entrer</button>
                </form>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-white p-6 md:p-12 font-sans">
            <div className="max-w-4xl mx-auto">
                <div className="flex justify-between items-center mb-8">
                    <h1 className="text-3xl font-bold flex items-center gap-2">
                        <Calendar className="text-black" />
                        Tableau de bord
                    </h1>
                    <button
                        onClick={() => {
                            localStorage.removeItem('adminAuth');
                            setIsAuthenticated(false);
                        }}
                        className="text-gray-500 underline"
                    >
                        Déconnexion
                    </button>
                </div>

                {/* Add Slot Section */}
                <div className="bg-gray-50 p-6 rounded-xl border border-gray-100 mb-10">
                    <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                        <Plus size={20} />
                        Ajouter un créneau
                    </h2>
                    <div className="flex flex-wrap gap-4 items-end">
                        <div>
                            <label className="block text-sm text-gray-500 mb-1">Date</label>
                            <input
                                type="date"
                                value={newDate}
                                onChange={e => setNewDate(e.target.value)}
                                className="border p-2 rounded bg-white text-black"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-gray-500 mb-1">Heure</label>
                            <input
                                type="time"
                                value={newTime}
                                onChange={e => setNewTime(e.target.value)}
                                className="border p-2 rounded bg-white text-black"
                            />
                        </div>
                        <button
                            onClick={handleAddSlot}
                            className="bg-black text-white px-4 py-2 rounded hover:bg-gray-800 transition"
                        >
                            Ajouter
                        </button>
                    </div>
                </div>

                {/* List Slots */}
                <div>
                    <h2 className="text-lg font-semibold mb-4">Vos créneaux (Prochainement)</h2>
                    {loading ? <Loader2 className="animate-spin" /> : (
                        <div className="bg-white border rounded-lg overflow-hidden">
                            <table className="w-full text-left">
                                <thead className="bg-gray-50 text-gray-500 text-sm">
                                    <tr>
                                        <th className="p-4">Date & Heure</th>
                                        <th className="p-4">Statut</th>
                                        <th className="p-4">Client</th>
                                        <th className="p-4 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {slots.map(slot => (
                                        <tr key={slot.id} className="hover:bg-gray-50">
                                            <td className="p-4 font-medium">
                                                {format(new Date(slot.startTime), "d MMM yyyy 'à' HH:mm", { locale: fr })}
                                            </td>
                                            <td className="p-4">
                                                {slot.isBooked ?
                                                    <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs font-bold">RÉSERVÉ</span> :
                                                    <span className="bg-gray-100 text-gray-800 px-2 py-1 rounded text-xs">DISPONIBLE</span>
                                                }
                                            </td>
                                            <td className="p-4 text-gray-600">
                                                {slot.clientName || '-'}
                                            </td>
                                            <td className="p-4 text-right">
                                                <button
                                                    onClick={() => handleDeleteSlot(slot.id)}
                                                    className="text-red-500 hover:bg-red-50 p-2 rounded transition"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {slots.length === 0 && <p className="p-8 text-center text-gray-400">Aucun créneau trouvé.</p>}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
