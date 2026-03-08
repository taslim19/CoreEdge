import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'VoltEdge | Premium Edge Image Hosting',
    description: 'Scalable, edge-based image hosting system that minimizes server bandwidth by redirecting directly to distributed storage infrastructure.',
};

import { Analytics } from "@vercel/analytics/react"
import Script from "next/script";
import ClientLayout from "./ClientLayout";

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en">
            <body>
                <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
                <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" />
                <ClientLayout>
                    {children}
                </ClientLayout>
                <Analytics />
            </body>
        </html>
    );
}
