'use client';

import { useEffect, useRef } from 'react';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    BarElement,
    ArcElement,
    PointElement,
    LineElement,
    RadialLinearScale,
    Title,
    Tooltip,
    Legend,
    Filler,
} from 'chart.js';
import { Bar, Doughnut, Radar, Scatter } from 'react-chartjs-2';

ChartJS.register(
    CategoryScale, LinearScale, BarElement, ArcElement,
    PointElement, LineElement, RadialLinearScale,
    Title, Tooltip, Legend, Filler
);

// Chart.js global defaults
ChartJS.defaults.color = '#94a3b8';
ChartJS.defaults.borderColor = '#1e293b';
ChartJS.defaults.font.family = 'Inter';

export default function Charts({ planes, sets }) {
    if (!planes?.length || !sets?.length) {
        return (
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                height: 200, color: 'var(--text-muted)', fontSize: 13,
            }}>
                No data available for charts
            </div>
        );
    }

    return (
        <div style={{ padding: 12 }}>
            {/* Plane distribution by set */}
            <ChartCard title="Plane Distribution by Set">
                <PlaneDistributionChart sets={sets} />
            </ChartCard>

            {/* Dip histogram */}
            <ChartCard title="Dip Angle Distribution">
                <DipHistogram planes={planes} />
            </ChartCard>

            {/* Dip Direction Rose-like Chart */}
            <ChartCard title="Dip Direction Analysis">
                <DipDirectionChart planes={planes} sets={sets} />
            </ChartCard>

            {/* Orientation Scatter */}
            <ChartCard title="Orientation Analysis (Dip vs Dip Direction)">
                <OrientationScatter planes={planes} sets={sets} />
            </ChartCard>

            {/* Set Quality Radar */}
            <ChartCard title="Set Quality & Confidence">
                <SetQualityRadar sets={sets} planes={planes} />
            </ChartCard>
        </div>
    );
}


function ChartCard({ title, children }) {
    return (
        <div className="glass-card" style={{ padding: 14, marginBottom: 12 }}>
            <div style={{
                fontSize: 11, fontWeight: 700, color: 'var(--text-primary)',
                marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5,
            }}>
                {title}
            </div>
            <div style={{ position: 'relative', height: 200 }}>
                {children}
            </div>
        </div>
    );
}


function PlaneDistributionChart({ sets }) {
    const data = {
        labels: sets.map(s => `Set ${s.set_id + 1}`),
        datasets: [{
            data: sets.map(s => s.num_planes),
            backgroundColor: sets.map(s => s.color + '99'),
            borderColor: sets.map(s => s.color),
            borderWidth: 2,
            borderRadius: 6,
            barThickness: 24,
        }],
    };

    const options = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            tooltip: {
                backgroundColor: 'rgba(10, 14, 23, 0.9)',
                borderColor: '#1e293b',
                borderWidth: 1,
                cornerRadius: 8,
                padding: 10,
                callbacks: {
                    label: (ctx) => `${ctx.parsed.y} planes`,
                },
            },
        },
        scales: {
            x: {
                grid: { display: false },
                ticks: { font: { size: 10 } },
            },
            y: {
                beginAtZero: true,
                grid: { color: 'rgba(30, 41, 59, 0.5)' },
                ticks: { font: { size: 10 }, stepSize: 1 },
            },
        },
    };

    return <Bar data={data} options={options} />;
}


function DipHistogram({ planes }) {
    // Create histogram bins (0-10, 10-20, ..., 80-90)
    const bins = Array(9).fill(0);
    planes.forEach(p => {
        const bin = Math.min(8, Math.floor((p.dip || 0) / 10));
        bins[bin]++;
    });

    const data = {
        labels: bins.map((_, i) => `${i * 10}-${(i + 1) * 10}°`),
        datasets: [{
            data: bins,
            backgroundColor: 'rgba(245, 158, 11, 0.3)',
            borderColor: '#f59e0b',
            borderWidth: 2,
            borderRadius: 4,
        }],
    };

    const options = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            tooltip: {
                backgroundColor: 'rgba(10, 14, 23, 0.9)',
                borderColor: '#1e293b',
                borderWidth: 1,
                cornerRadius: 8,
            },
        },
        scales: {
            x: {
                grid: { display: false },
                ticks: { font: { size: 9 } },
            },
            y: {
                beginAtZero: true,
                grid: { color: 'rgba(30, 41, 59, 0.5)' },
                ticks: { font: { size: 10 }, stepSize: 1 },
            },
        },
    };

    return <Bar data={data} options={options} />;
}


function DipDirectionChart({ planes, sets }) {
    // Create direction bins (N, NE, E, SE, S, SW, W, NW)
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

    const datasets = sets.map(s => {
        const setPlanes = planes.filter(p => p.set_id === s.set_id);
        const binCounts = Array(8).fill(0);
        setPlanes.forEach(p => {
            const bin = Math.floor(((p.dip_direction || 0) + 22.5) / 45) % 8;
            binCounts[bin]++;
        });
        return {
            label: `Set ${s.set_id + 1}`,
            data: binCounts,
            backgroundColor: s.color + '40',
            borderColor: s.color,
            borderWidth: 2,
            pointBackgroundColor: s.color,
            pointBorderColor: s.color,
        };
    });

    const data = { labels: dirs, datasets };

    const options = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'bottom',
                labels: { font: { size: 10 }, boxWidth: 10, padding: 8 },
            },
        },
        scales: {
            r: {
                angleLines: { color: 'rgba(30, 41, 59, 0.5)' },
                grid: { color: 'rgba(30, 41, 59, 0.5)' },
                ticks: { font: { size: 9 }, backdropColor: 'transparent' },
                pointLabels: { font: { size: 10 } },
            },
        },
    };

    return <Radar data={data} options={options} />;
}


function OrientationScatter({ planes, sets }) {
    const datasets = sets.map(s => {
        const setPlanes = planes.filter(p => p.set_id === s.set_id);
        return {
            label: `Set ${s.set_id + 1}`,
            data: setPlanes.map(p => ({ x: p.dip_direction, y: p.dip })),
            backgroundColor: s.color + 'CC',
            borderColor: s.color,
            borderWidth: 1,
            pointRadius: 5,
            pointHoverRadius: 8,
        };
    });

    const data = { datasets };

    const options = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'bottom',
                labels: { font: { size: 10 }, boxWidth: 10, padding: 8 },
            },
            tooltip: {
                backgroundColor: 'rgba(10, 14, 23, 0.9)',
                borderColor: '#1e293b',
                borderWidth: 1,
                callbacks: {
                    label: (ctx) => `Dip: ${ctx.parsed.y.toFixed(1)}° | Dir: ${ctx.parsed.x.toFixed(1)}°`,
                },
            },
        },
        scales: {
            x: {
                title: { display: true, text: 'Dip Direction (°)', font: { size: 10 } },
                min: 0, max: 360,
                grid: { color: 'rgba(30, 41, 59, 0.5)' },
                ticks: { font: { size: 9 }, stepSize: 45 },
            },
            y: {
                title: { display: true, text: 'Dip (°)', font: { size: 10 } },
                min: 0, max: 90,
                grid: { color: 'rgba(30, 41, 59, 0.5)' },
                ticks: { font: { size: 9 }, stepSize: 15 },
            },
        },
    };

    return <Scatter data={data} options={options} />;
}


function SetQualityRadar({ sets, planes }) {
    const labels = sets.map(s => `Set ${s.set_id + 1}`);

    const datasets = [
        {
            label: 'Confidence',
            data: sets.map(s => {
                const sp = planes.filter(p => p.set_id === s.set_id);
                return sp.length > 0 ? sp.reduce((avg, p) => avg + (p.confidence || 0), 0) / sp.length * 100 : 0;
            }),
            backgroundColor: 'rgba(245, 158, 11, 0.2)',
            borderColor: '#f59e0b',
            borderWidth: 2,
        },
        {
            label: 'Coverage',
            data: sets.map(s => Math.min(100, s.total_points / 50)),
            backgroundColor: 'rgba(59, 130, 246, 0.2)',
            borderColor: '#3b82f6',
            borderWidth: 2,
        },
    ];

    const data = { labels, datasets };

    const options = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'bottom',
                labels: { font: { size: 10 }, boxWidth: 10, padding: 8 },
            },
        },
        scales: {
            r: {
                angleLines: { color: 'rgba(30, 41, 59, 0.5)' },
                grid: { color: 'rgba(30, 41, 59, 0.5)' },
                ticks: { font: { size: 9 }, backdropColor: 'transparent' },
                pointLabels: { font: { size: 10 } },
                max: 100,
            },
        },
    };

    return <Radar data={data} options={options} />;
}
