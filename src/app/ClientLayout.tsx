'use client';

import { useEffect, useState } from 'react';

export default function ClientLayout({ children }: { children: React.ReactNode }) {
    const [isTelegram, setIsTelegram] = useState(false);

    useEffect(() => {
        // Detect Telegram WebApp
        if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp) {
            const tg = (window as any).Telegram.WebApp;

            // Basic initialization
            tg.ready();
            tg.expand();

            // Optional: Set theme colors
            if (tg.setHeaderColor) tg.setHeaderColor('bg_color');
            if (tg.setBackgroundColor) tg.setBackgroundColor('bg_color');

            setIsTelegram(true);

            // Add a class to the body for CSS targeting
            document.body.classList.add('telegram-app');
        }
    }, []);

    return (
        <>
            {/* Decorative Technical Elements - Moved here to allow conditional logic if needed */}
            <div style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100vw',
                height: '100vh',
                zIndex: -9,
                pointerEvents: 'none',
                overflow: 'hidden'
            }}>
                {/* Top-left corner + icon */}
                <div style={{
                    position: 'absolute',
                    top: '5%',
                    left: '5%',
                    color: 'rgba(0, 240, 255, 0.15)',
                    fontSize: '24px',
                    fontFamily: 'monospace',
                    fontWeight: 'bold',
                    display: isTelegram ? 'none' : 'block' // Hide on Telegram to save space
                }}>+</div>

                {/* Top-right corner x icon */}
                <div style={{
                    position: 'absolute',
                    top: '5%',
                    right: '5%',
                    color: 'rgba(0, 240, 255, 0.15)',
                    fontSize: '24px',
                    fontFamily: 'monospace',
                    fontWeight: 'bold',
                    display: isTelegram ? 'none' : 'block' // Hide on Telegram to save space
                }}>×</div>

                {/* Bottom-left corner + icon */}
                <div style={{
                    position: 'absolute',
                    bottom: '5%',
                    left: '5%',
                    color: 'rgba(0, 240, 255, 0.15)',
                    fontSize: '24px',
                    fontFamily: 'monospace',
                    fontWeight: 'bold',
                    display: isTelegram ? 'none' : 'block' // Hide on Telegram to save space
                }}>+</div>

                {/* Bottom-right corner x icon */}
                <div style={{
                    position: 'absolute',
                    bottom: '5%',
                    right: '5%',
                    color: 'rgba(0, 240, 255, 0.15)',
                    fontSize: '24px',
                    fontFamily: 'monospace',
                    fontWeight: 'bold',
                    display: isTelegram ? 'none' : 'block' // Hide on Telegram to save space
                }}>×</div>
            </div>

            {children}
        </>
    );
}
