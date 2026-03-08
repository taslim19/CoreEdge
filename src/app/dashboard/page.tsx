'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
    Key, Plus, Trash2, Copy, Check, LogOut, User,
    Settings, Webhook, Eye, EyeOff, X, AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Script from 'next/script';

declare global {
    interface Window {
        google: any;
        handleGoogleResponse: (response: any) => void;
    }
}

interface User {
    id: string;
    email: string;
    created_at: number;
    last_login?: number;
    role?: string;
}

interface ApiKey {
    id: string;
    name: string;
    prefix: string;
    rate_limit: number;
    created_at: number;
    last_used?: number;
    is_active: boolean;
}

interface Webhook {
    id: string;
    url: string;
    events: string[];
    is_active: boolean;
    created_at: number;
}

export default function Dashboard() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [tgUser, setTgUser] = useState<any>(null);
    const [isTelegram, setIsTelegram] = useState(false);
    const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
    const [webhooks, setWebhooks] = useState<Webhook[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'keys' | 'webhooks' | 'settings'>('keys');
    const [showCreateKey, setShowCreateKey] = useState(false);
    const [newKeyName, setNewKeyName] = useState('');
    const [newKeyRateLimit, setNewKeyRateLimit] = useState(100);
    const [newKeyValue, setNewKeyValue] = useState<string | null>(null);
    const [copiedKey, setCopiedKey] = useState<string | null>(null);
    const [showCreateWebhook, setShowCreateWebhook] = useState(false);
    const [newWebhookUrl, setNewWebhookUrl] = useState('');
    const [newWebhookEvents, setNewWebhookEvents] = useState<string[]>(['upload']);

    useEffect(() => {
        checkAuth();
    }, []);

    const checkAuth = async () => {
        try {
            // Check for Telegram WebApp environment first
            if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp?.initDataUnsafe?.user) {
                const tgApp = (window as any).Telegram.WebApp;
                tgApp.ready();
                setIsTelegram(true);
                setTgUser(tgApp.initDataUnsafe.user);

                try {
                    const tgRes = await fetch('/api/v2/auth/telegram', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            initData: tgApp.initData,
                            user: tgApp.initDataUnsafe.user
                        })
                    });

                    if (tgRes.ok) {
                        const tgData = await tgRes.json();
                        setUser(tgData.data.user);
                        loadData();
                        setLoading(false);
                        return; // Successfully authenticated via Telegram
                    }
                } catch (tgError) {
                    console.error('Telegram auth failed', tgError);
                }
            }

            const res = await fetch('/api/v2/auth/me');
            if (res.ok) {
                const data = await res.json();
                setUser(data.data);
                loadData();
            } else {
                router.push('/dashboard?login=true');
            }
        } catch (error) {
            router.push('/dashboard?login=true');
        } finally {
            setLoading(false);
        }
    };

    const loadData = async () => {
        try {
            const [keysRes, webhooksRes] = await Promise.all([
                fetch('/api/v2/keys'),
                fetch('/api/v2/webhooks')
            ]);

            if (keysRes.ok) {
                const keysData = await keysRes.json();
                setApiKeys(keysData.data || []);
            }

            if (webhooksRes.ok) {
                const webhooksData = await webhooksRes.json();
                setWebhooks(webhooksData.data || []);
            }
        } catch (error) {
            console.error('Failed to load data:', error);
        }
    };

    const handleLogout = async () => {
        await fetch('/api/v2/auth/logout', { method: 'POST' });
        router.push('/');
    };

    const createApiKey = async () => {
        if (!newKeyName.trim()) return;

        try {
            const res = await fetch('/api/v2/keys', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: newKeyName,
                    rate_limit: newKeyRateLimit
                })
            });

            if (res.ok) {
                const data = await res.json();
                setNewKeyValue(data.data.key);
                setNewKeyName('');
                setNewKeyRateLimit(100);
                loadData();
            }
        } catch (error) {
            console.error('Failed to create API key:', error);
        }
    };

    const deleteApiKey = async (id: string) => {
        if (!confirm('Are you sure you want to delete this API key?')) return;

        try {
            const res = await fetch(`/api/v2/keys/${id}`, { method: 'DELETE' });
            if (res.ok) {
                loadData();
            }
        } catch (error) {
            console.error('Failed to delete API key:', error);
        }
    };

    const copyToClipboard = (text: string, id: string) => {
        navigator.clipboard.writeText(text);
        setCopiedKey(id);
        setTimeout(() => setCopiedKey(null), 2000);
    };

    const createWebhook = async () => {
        if (!newWebhookUrl.trim()) return;

        try {
            const res = await fetch('/api/v2/webhooks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: newWebhookUrl,
                    events: newWebhookEvents
                })
            });

            if (res.ok) {
                setNewWebhookUrl('');
                setNewWebhookEvents(['upload']);
                setShowCreateWebhook(false);
                loadData();
            }
        } catch (error) {
            console.error('Failed to create webhook:', error);
        }
    };

    const deleteWebhook = async (id: string) => {
        if (!confirm('Are you sure you want to delete this webhook?')) return;

        try {
            const res = await fetch(`/api/v2/webhooks/${id}`, { method: 'DELETE' });
            if (res.ok) {
                loadData();
            }
        } catch (error) {
            console.error('Failed to delete webhook:', error);
        }
    };

    if (loading) {
        return (
            <div style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                minHeight: '100vh',
                color: 'var(--text-main)'
            }}>
                Loading...
            </div>
        );
    }

    if (!user) {
        return <LoginForm onSuccess={checkAuth} />;
    }

    return (
        <div
            className={`dashboard-container ${isTelegram ? 'telegram-app' : ''}`}
            style={{
                minHeight: '100vh',
                padding: isTelegram ? '1rem' : '3rem 2rem',
                maxWidth: '1200px',
                margin: '0 auto',
                background: '#000000',
                position: 'relative',
                fontFamily: "'Inter', sans-serif",
                color: '#FFFFFF'
            }}
        >
            {/* Background Ambient Glows */}
            <div style={{
                position: 'fixed',
                top: '-10%',
                right: '-10%',
                width: '40vw',
                height: '40vw',
                background: 'radial-gradient(circle, rgba(0, 240, 255, 0.05) 0%, transparent 70%)',
                zIndex: 0,
                pointerEvents: 'none'
            }} />
            <div style={{
                position: 'fixed',
                bottom: '-10%',
                left: '-10%',
                width: '40vw',
                height: '40vw',
                background: 'radial-gradient(circle, rgba(0, 240, 255, 0.03) 0%, transparent 70%)',
                zIndex: 0,
                pointerEvents: 'none'
            }} />
            {/* Decorative Technical Elements */}
            <div style={{
                position: 'fixed',
                top: '2rem',
                left: '2rem',
                color: 'rgba(0, 240, 255, 0.1)',
                fontSize: '24px',
                fontFamily: 'monospace',
                fontWeight: 'bold',
                zIndex: 0,
                pointerEvents: 'none'
            }}>+</div>
            <div style={{
                position: 'fixed',
                top: '2rem',
                right: '2rem',
                color: 'rgba(0, 240, 255, 0.1)',
                fontSize: '24px',
                fontFamily: 'monospace',
                fontWeight: 'bold',
                zIndex: 0,
                pointerEvents: 'none'
            }}>×</div>
            <div style={{
                position: 'fixed',
                bottom: '2rem',
                left: '2rem',
                color: 'rgba(0, 240, 255, 0.1)',
                fontSize: '24px',
                fontFamily: 'monospace',
                fontWeight: 'bold',
                zIndex: 0,
                pointerEvents: 'none'
            }}>+</div>
            <div style={{
                position: 'fixed',
                bottom: '2rem',
                right: '2rem',
                color: 'rgba(0, 240, 255, 0.1)',
                fontSize: '24px',
                fontFamily: 'monospace',
                fontWeight: 'bold',
                zIndex: 0,
                pointerEvents: 'none'
            }}>×</div>
            <div
                className="dashboard-header glass-panel"
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: isTelegram ? '1.5rem' : '3rem',
                    padding: isTelegram ? '1rem' : '1.5rem 2rem',
                    position: 'relative',
                    zIndex: 1,
                    border: '1px solid rgba(255, 255, 255, 0.05)',
                    background: 'rgba(255, 255, 255, 0.02)',
                    boxShadow: '0 4px 24px rgba(0, 0, 0, 0.4)'
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: isTelegram ? '0.75rem' : '1.25rem' }}>
                    <div style={{ position: 'relative' }}>
                        <div style={{
                            width: isTelegram ? '44px' : '56px',
                            height: isTelegram ? '44px' : '56px',
                            borderRadius: '50%',
                            overflow: 'hidden',
                            border: '2px solid rgba(0, 240, 255, 0.2)',
                            background: 'rgba(255, 255, 255, 0.05)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}>
                            {isTelegram && tgUser?.photo_url ? (
                                <img src={tgUser.photo_url} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                                <User size={isTelegram ? 20 : 24} color="rgba(255, 255, 255, 0.5)" />
                            )}
                        </div>
                        <div style={{
                            position: 'absolute',
                            bottom: '2px',
                            right: '2px',
                            width: '10px',
                            height: '10px',
                            background: '#00E676',
                            borderRadius: '50%',
                            border: '2px solid #000',
                            boxShadow: '0 0 8px rgba(0, 230, 118, 0.5)'
                        }} />
                    </div>
                    <div>
                        <h1 style={{
                            fontSize: isTelegram ? '1.25rem' : '1.75rem',
                            fontWeight: 800,
                            letterSpacing: '-0.02em',
                            marginBottom: '0',
                            color: '#FFFFFF',
                            fontFamily: "'Inter', sans-serif"
                        }}>
                            {isTelegram && tgUser ? (tgUser.first_name) : (user?.email?.split('@')[0] || 'Dashboard')}
                        </h1>
                        <p style={{
                            color: 'rgba(255, 255, 255, 0.4)',
                            fontFamily: "'JetBrains Mono', monospace",
                            fontSize: isTelegram ? '0.7rem' : '0.8rem',
                            marginTop: '2px'
                        }}>
                            {isTelegram && tgUser ? `@${tgUser.username || tgUser.id}` : (user?.role || 'User')}
                        </p>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                    {!isTelegram && (
                        <Link href="/" style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '10px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: 'rgba(255, 255, 255, 0.03)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            color: 'rgba(255, 255, 255, 0.6)',
                            transition: 'all 0.2s ease',
                            textDecoration: 'none'
                        }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                                e.currentTarget.style.color = '#00F0FF';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                                e.currentTarget.style.color = 'rgba(255, 255, 255, 0.6)';
                            }}
                        >
                            <Plus size={18} />
                        </Link>
                    )}
                    <button
                        onClick={handleLogout}
                        title="Logout"
                        style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '10px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: 'rgba(255, 255, 255, 0.03)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            color: 'rgba(255, 255, 255, 0.6)',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease'
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(255, 75, 43, 0.1)';
                            e.currentTarget.style.color = '#FF4B2B';
                            e.currentTarget.style.borderColor = 'rgba(255, 75, 43, 0.2)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                            e.currentTarget.style.color = 'rgba(255, 255, 255, 0.6)';
                            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                        }}
                    >
                        <LogOut size={18} />
                    </button>
                </div>
            </div>

            <div
                className="dashboard-tabs"
                style={{
                    display: 'flex',
                    gap: isTelegram ? '0.5rem' : '1.5rem',
                    marginBottom: isTelegram ? '1.5rem' : '2.5rem',
                    padding: '0.25rem',
                    background: 'rgba(255, 255, 255, 0.03)',
                    borderRadius: '12px',
                    width: 'fit-content',
                    position: 'relative',
                    zIndex: 1,
                    overflowX: isTelegram ? 'auto' : 'visible',
                    scrollbarWidth: 'none',
                    border: '1px solid rgba(255, 255, 255, 0.05)'
                }}
            >
                {(['keys', 'webhooks', 'settings'] as const).map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        style={{
                            padding: isTelegram ? '0.6rem 1rem' : '0.75rem 1.5rem',
                            borderRadius: '10px',
                            background: activeTab === tab ? 'rgba(0, 240, 255, 0.1)' : 'transparent',
                            color: activeTab === tab ? '#00F0FF' : 'rgba(255, 255, 255, 0.4)',
                            cursor: 'pointer',
                            textTransform: 'uppercase',
                            fontWeight: 700,
                            fontFamily: "'JetBrains Mono', monospace",
                            fontSize: isTelegram ? '0.7rem' : '0.8rem',
                            letterSpacing: '0.05em',
                            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            border: activeTab === tab ? '1px solid rgba(0, 240, 255, 0.2)' : '1px solid transparent',
                            position: 'relative'
                        }}
                    >
                        <div style={{
                            width: '40px',
                            height: '2px',
                            background: '#00F0FF',
                            position: 'absolute',
                            bottom: '0',
                            left: '50%',
                            transform: activeTab === tab ? 'translateX(-50%) scaleX(1)' : 'translateX(-50%) scaleX(0)',
                            opacity: activeTab === tab ? 1 : 0,
                            transition: 'all 0.3s ease',
                            borderRadius: '2px',
                            boxShadow: '0 0 8px #00F0FF',
                            display: 'none' // Hidden for now, using background pill instead
                        }} />
                        {tab}
                        {activeTab === tab && (
                            <motion.div
                                layoutId="tab-pill"
                                style={{
                                    position: 'absolute',
                                    inset: 0,
                                    background: 'rgba(0, 240, 255, 0.05)',
                                    borderRadius: '10px',
                                    zIndex: -1,
                                    border: '1px solid rgba(0, 240, 255, 0.1)'
                                }}
                            />
                        )}
                    </button>
                ))}
            </div>

            <AnimatePresence mode="wait">
                {activeTab === 'keys' && (
                    <motion.div
                        key="keys"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                    >
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-end',
                            marginBottom: '2rem',
                            position: 'relative',
                            zIndex: 1,
                            padding: '0 0.5rem'
                        }}>
                            <div>
                                <h2 style={{
                                    fontSize: isTelegram ? '1.25rem' : '1.5rem',
                                    fontWeight: 800,
                                    color: '#FFFFFF',
                                    fontFamily: "'Inter', sans-serif",
                                    marginBottom: '4px'
                                }}>API Keys</h2>
                                <p style={{ color: 'rgba(255, 255, 255, 0.4)', fontSize: '0.8rem', fontFamily: "'JetBrains Mono', monospace" }}>
                                    Manage your security credentials
                                </p>
                            </div>
                            <button
                                onClick={() => setShowCreateKey(true)}
                                style={{
                                    padding: isTelegram ? '0.5rem 1rem' : '0.75rem 1.5rem',
                                    borderRadius: '12px',
                                    background: 'linear-gradient(135deg, #00F0FF, #00D1FF)',
                                    border: 'none',
                                    color: '#000000',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    fontFamily: "'Inter', sans-serif",
                                    fontWeight: 800,
                                    fontSize: '0.9rem',
                                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                    boxShadow: '0 0 20px rgba(0, 240, 255, 0.3)'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.boxShadow = '0 0 30px rgba(0, 240, 255, 0.5)';
                                    e.currentTarget.style.transform = 'translateY(-2px) scale(1.02)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.boxShadow = '0 0 20px rgba(0, 240, 255, 0.3)';
                                    e.currentTarget.style.transform = 'translateY(0) scale(1)';
                                }}
                            >
                                <Plus size={18} />
                                {!isTelegram && "Create New Key"}
                            </button>
                        </div>

                        {newKeyValue && (
                            <div style={{
                                padding: '1.5rem',
                                borderRadius: '12px',
                                background: 'var(--panel-bg)',
                                border: '1px solid var(--border-color)',
                                marginBottom: '1.5rem'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                    <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>New API Key Created</h3>
                                    <button onClick={() => setNewKeyValue(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                                        <X size={20} />
                                    </button>
                                </div>
                                <p style={{ color: 'var(--text-muted)', marginBottom: '1rem', fontSize: '0.9rem' }}>
                                    Save this key now. You won't be able to see it again!
                                </p>
                                <div style={{
                                    padding: '1rem',
                                    borderRadius: '8px',
                                    background: 'var(--input-bg)',
                                    fontFamily: 'monospace',
                                    fontSize: '0.9rem',
                                    wordBreak: 'break-all',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    gap: '1rem'
                                }}>
                                    <span>{newKeyValue}</span>
                                    <button
                                        onClick={() => copyToClipboard(newKeyValue, 'new')}
                                        style={{
                                            background: 'none',
                                            border: 'none',
                                            color: 'var(--text-main)',
                                            cursor: 'pointer',
                                            padding: '0.5rem'
                                        }}
                                    >
                                        {copiedKey === 'new' ? <Check size={18} /> : <Copy size={18} />}
                                    </button>
                                </div>
                            </div>
                        )}

                        {showCreateKey && (
                            <div style={{
                                padding: '1.5rem',
                                borderRadius: '12px',
                                background: 'var(--panel-bg)',
                                border: '1px solid var(--border-color)',
                                marginBottom: '1.5rem'
                            }}>
                                <h3 style={{ marginBottom: '1rem', fontSize: '1.1rem', fontWeight: 600 }}>Create API Key</h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    <input
                                        type="text"
                                        placeholder="Key name (e.g., Production, Development)"
                                        value={newKeyName}
                                        onChange={(e) => setNewKeyName(e.target.value)}
                                        style={{
                                            padding: '0.75rem',
                                            borderRadius: '8px',
                                            background: 'var(--input-bg)',
                                            border: '1px solid var(--border-color)',
                                            color: 'var(--text-main)',
                                            fontSize: '1rem'
                                        }}
                                    />
                                    <input
                                        type="number"
                                        placeholder="Rate limit (default: 100)"
                                        value={newKeyRateLimit}
                                        onChange={(e) => setNewKeyRateLimit(parseInt(e.target.value) || 100)}
                                        style={{
                                            padding: '0.75rem',
                                            borderRadius: '8px',
                                            background: 'var(--input-bg)',
                                            border: '1px solid var(--border-color)',
                                            color: 'var(--text-main)',
                                            fontSize: '1rem'
                                        }}
                                    />
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        <button
                                            onClick={createApiKey}
                                            style={{
                                                padding: '0.75rem 1.5rem',
                                                borderRadius: '8px',
                                                background: 'var(--accent-primary)',
                                                border: 'none',
                                                color: 'white',
                                                cursor: 'pointer',
                                                flex: 1
                                            }}
                                        >
                                            Create
                                        </button>
                                        <button
                                            onClick={() => {
                                                setShowCreateKey(false);
                                                setNewKeyName('');
                                                setNewKeyRateLimit(100);
                                            }}
                                            style={{
                                                padding: '0.75rem 1.5rem',
                                                borderRadius: '8px',
                                                background: 'var(--panel-bg)',
                                                border: '1px solid var(--border-color)',
                                                color: 'var(--text-main)',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            {apiKeys.length === 0 ? (
                                <div className="glass-panel" style={{
                                    padding: '4rem 2rem',
                                    textAlign: 'center',
                                    color: 'rgba(255, 255, 255, 0.3)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    gap: '1rem',
                                    background: 'rgba(255, 255, 255, 0.01)',
                                    border: '1px dashed rgba(255, 255, 255, 0.1)'
                                }}>
                                    <div style={{
                                        width: '64px',
                                        height: '64px',
                                        borderRadius: '20px',
                                        background: 'rgba(255, 255, 255, 0.03)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        marginBottom: '0.5rem'
                                    }}>
                                        <Key size={32} />
                                    </div>
                                    <h3 style={{ color: '#FFFFFF', fontWeight: 600, fontSize: '1.1rem' }}>No API keys found</h3>
                                    <p style={{ maxWidth: '300px', fontSize: '0.9rem' }}>
                                        Generate your first API key to start integrating CoreEdge into your applications.
                                    </p>
                                </div>
                            ) : (
                                apiKeys.map(key => (
                                    <div
                                        key={key.id}
                                        className="glass-panel"
                                        style={{
                                            padding: isTelegram ? '1.25rem' : '1.5rem 2rem',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            position: 'relative',
                                            zIndex: 1,
                                            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)'
                                        }}
                                    >
                                        <div style={{ flex: 1 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                                                <div style={{
                                                    width: '32px',
                                                    height: '32px',
                                                    borderRadius: '8px',
                                                    background: 'rgba(0, 240, 255, 0.05)',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    border: '1px solid rgba(0, 240, 255, 0.1)'
                                                }}>
                                                    <Key size={16} color="#00F0FF" />
                                                </div>
                                                <h3 style={{
                                                    fontWeight: 700,
                                                    color: '#FFFFFF',
                                                    fontFamily: "'Inter', sans-serif",
                                                    fontSize: '1rem'
                                                }}>{key.name}</h3>
                                                <span style={{
                                                    padding: '0.2rem 0.6rem',
                                                    borderRadius: '6px',
                                                    background: 'rgba(255, 255, 255, 0.03)',
                                                    border: '1px solid rgba(255, 255, 255, 0.05)',
                                                    color: 'rgba(255, 255, 255, 0.4)',
                                                    fontSize: '0.65rem',
                                                    fontFamily: "'JetBrains Mono', monospace",
                                                    fontWeight: 500
                                                }}>ID: {key.id.slice(0, 8)}</span>
                                                {!key.is_active && (
                                                    <span style={{
                                                        padding: '0.2rem 0.6rem',
                                                        borderRadius: '6px',
                                                        background: 'rgba(255, 75, 43, 0.1)',
                                                        border: '1px solid rgba(255, 75, 43, 0.2)',
                                                        color: '#FF4B2B',
                                                        fontSize: '0.65rem',
                                                        fontFamily: "'JetBrains Mono', monospace",
                                                        fontWeight: 700,
                                                        letterSpacing: '0.05em'
                                                    }}>REVOKED</span>
                                                )}
                                            </div>
                                            <div style={{
                                                background: 'rgba(0, 0, 0, 0.2)',
                                                padding: '0.75rem 1rem',
                                                borderRadius: '10px',
                                                border: '1px solid rgba(255, 255, 255, 0.03)',
                                                marginBottom: '1rem',
                                                display: 'inline-block'
                                            }}>
                                                <p style={{
                                                    color: '#00F0FF',
                                                    fontSize: '0.85rem',
                                                    fontFamily: "'JetBrains Mono', monospace",
                                                    letterSpacing: '0.1em',
                                                    margin: 0
                                                }}>
                                                    {key.prefix}<span style={{ opacity: 0.3 }}>••••••••••••••••</span>
                                                </p>
                                            </div>
                                            <div style={{
                                                display: 'flex',
                                                gap: '1.5rem',
                                                fontSize: '0.75rem',
                                                color: 'rgba(255, 255, 255, 0.4)',
                                                fontFamily: "'JetBrains Mono', monospace"
                                            }}>
                                                <span>RATE_LIMIT: <span style={{ color: 'rgba(255, 255, 255, 0.7)' }}>{key.rate_limit}/min</span></span>
                                                {key.last_used && (
                                                    <span>LAST_USED: <span style={{ color: 'rgba(255, 255, 255, 0.7)' }}>{new Date(key.last_used).toLocaleDateString()}</span></span>
                                                )}
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => deleteApiKey(key.id)}
                                            style={{
                                                padding: '0.5rem',
                                                borderRadius: '8px',
                                                background: 'transparent',
                                                border: '1px solid rgba(239, 68, 68, 0.2)',
                                                color: 'rgba(239, 68, 68, 0.5)',
                                                cursor: 'pointer',
                                                transition: 'all 0.3s'
                                            }}
                                            onMouseEnter={(e) => {
                                                e.currentTarget.style.borderColor = '#ef4444';
                                                e.currentTarget.style.color = '#ef4444';
                                                e.currentTarget.style.boxShadow = '0 0 12px rgba(239, 68, 68, 0.3)';
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.2)';
                                                e.currentTarget.style.color = 'rgba(239, 68, 68, 0.5)';
                                                e.currentTarget.style.boxShadow = 'none';
                                            }}
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    </motion.div>
                )}

                {activeTab === 'webhooks' && (
                    <motion.div
                        key="webhooks"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                    >
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: '1.5rem'
                        }}>
                            <h2 style={{ fontSize: '1.5rem', fontWeight: 600 }}>Webhooks</h2>
                            <button
                                onClick={() => setShowCreateWebhook(true)}
                                style={{
                                    padding: '0.5rem 1rem',
                                    borderRadius: '8px',
                                    background: 'var(--accent-primary)',
                                    border: 'none',
                                    color: 'white',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem'
                                }}
                            >
                                <Plus size={16} />
                                Create Webhook
                            </button>
                        </div>

                        {showCreateWebhook && (
                            <div className="glass-panel" style={{
                                padding: isTelegram ? '1.25rem' : '2rem',
                                marginBottom: '2rem',
                                border: '1px solid rgba(0, 240, 255, 0.2)',
                                background: 'rgba(0, 240, 255, 0.02)',
                                position: 'relative',
                                zIndex: 2
                            }}>
                                <h3 style={{ marginBottom: '1.5rem', fontSize: '1.2rem', fontWeight: 800, color: '#FFFFFF', fontFamily: "'Inter', sans-serif" }}>CONFIGURE_WEBHOOK</h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                    <div>
                                        <label style={{
                                            display: 'block',
                                            marginBottom: '0.5rem',
                                            fontSize: '0.75rem',
                                            fontWeight: 700,
                                            color: '#00F0FF',
                                            fontFamily: "'JetBrains Mono', monospace",
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.1em'
                                        }}>TARGET_URL</label>
                                        <input
                                            type="url"
                                            placeholder="https://your-server.com/webhook"
                                            value={newWebhookUrl}
                                            onChange={(e) => setNewWebhookUrl(e.target.value)}
                                            style={{
                                                width: '100%',
                                                padding: '0.875rem',
                                                borderRadius: '12px',
                                                background: 'rgba(0, 0, 0, 0.3)',
                                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                                color: '#FFFFFF',
                                                fontSize: '1rem',
                                                fontFamily: "'JetBrains Mono', monospace"
                                            }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{
                                            display: 'block',
                                            marginBottom: '1rem',
                                            fontSize: '0.75rem',
                                            fontWeight: 700,
                                            color: '#00F0FF',
                                            fontFamily: "'JetBrains Mono', monospace",
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.1em'
                                        }}>SELECT_EVENTS</label>
                                        <div style={{ display: 'flex', gap: '1.5rem' }}>
                                            {['upload', 'delete'].map(event => (
                                                <label key={event} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={newWebhookEvents.includes(event)}
                                                        onChange={(e) => {
                                                            if (e.target.checked) {
                                                                setNewWebhookEvents([...newWebhookEvents, event]);
                                                            } else {
                                                                setNewWebhookEvents(newWebhookEvents.filter(ev => ev !== event));
                                                            }
                                                        }}
                                                        style={{ width: '18px', height: '18px', accentColor: '#00F0FF' }}
                                                    />
                                                    <span style={{ color: '#FFFFFF', fontSize: '0.9rem', textTransform: 'uppercase', fontFamily: "'JetBrains Mono', monospace" }}>{event}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                                        <button
                                            onClick={createWebhook}
                                            style={{
                                                padding: '0.75rem 1.5rem',
                                                borderRadius: '12px',
                                                background: '#00F0FF',
                                                border: 'none',
                                                color: '#000000',
                                                cursor: 'pointer',
                                                flex: 1,
                                                fontWeight: 800,
                                                fontFamily: "'Inter', sans-serif"
                                            }}
                                        >
                                            INITIALIZE_WEBHOOK
                                        </button>
                                        <button
                                            onClick={() => {
                                                setShowCreateWebhook(false);
                                                setNewWebhookUrl('');
                                                setNewWebhookEvents(['upload']);
                                            }}
                                            style={{
                                                padding: '0.75rem 1.5rem',
                                                borderRadius: '12px',
                                                background: 'rgba(255, 255, 255, 0.05)',
                                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                                color: '#FFFFFF',
                                                cursor: 'pointer',
                                                fontWeight: 600
                                            }}
                                        >
                                            CANCEL
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            {webhooks.length === 0 ? (
                                <div className="glass-panel" style={{
                                    padding: '4rem 2rem',
                                    textAlign: 'center',
                                    color: 'rgba(255, 255, 255, 0.3)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    gap: '1rem',
                                    background: 'rgba(255, 255, 255, 0.01)',
                                    border: '1px dashed rgba(255, 255, 255, 0.1)'
                                }}>
                                    <div style={{
                                        width: '64px',
                                        height: '64px',
                                        borderRadius: '20px',
                                        background: 'rgba(255, 255, 255, 0.03)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        marginBottom: '0.5rem'
                                    }}>
                                        <Webhook size={32} />
                                    </div>
                                    <h3 style={{ color: '#FFFFFF', fontWeight: 600, fontSize: '1.1rem' }}>No webhooks configured</h3>
                                    <p style={{ maxWidth: '300px', fontSize: '0.9rem' }}>
                                        Registered webhooks will appear here to receive real-time event notifications.
                                    </p>
                                </div>
                            ) : (
                                webhooks.map(webhook => (
                                    <div
                                        key={webhook.id}
                                        className="glass-panel"
                                        style={{
                                            padding: isTelegram ? '1.25rem' : '1.5rem 2rem',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
                                            position: 'relative',
                                            zIndex: 1
                                        }}
                                    >
                                        <div style={{ flex: 1 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                                                <div style={{
                                                    width: '32px',
                                                    height: '32px',
                                                    borderRadius: '8px',
                                                    background: 'rgba(0, 240, 255, 0.05)',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    border: '1px solid rgba(0, 240, 255, 0.1)'
                                                }}>
                                                    <Webhook size={16} color="#00F0FF" />
                                                </div>
                                                <h3 style={{ fontWeight: 700, fontSize: '1rem', fontFamily: "'JetBrains Mono', monospace", color: '#FFFFFF' }}>
                                                    {webhook.url}
                                                </h3>
                                                <span style={{
                                                    padding: '0.2rem 0.6rem',
                                                    borderRadius: '6px',
                                                    background: webhook.is_active ? 'rgba(0, 230, 118, 0.1)' : 'rgba(255, 75, 43, 0.1)',
                                                    border: `1px solid ${webhook.is_active ? 'rgba(0, 230, 118, 0.2)' : 'rgba(255, 75, 43, 0.2)'}`,
                                                    color: webhook.is_active ? '#00E676' : '#FF4B2B',
                                                    fontSize: '0.65rem',
                                                    fontFamily: "'JetBrains Mono', monospace",
                                                    fontWeight: 700,
                                                    textTransform: 'uppercase'
                                                }}>
                                                    {webhook.is_active ? 'Active' : 'Inactive'}
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                    {webhook.events.map(event => (
                                                        <span key={event} style={{
                                                            fontSize: '0.7rem',
                                                            color: 'rgba(255, 255, 255, 0.4)',
                                                            fontFamily: "'JetBrains Mono', monospace",
                                                            background: 'rgba(255, 255, 255, 0.03)',
                                                            padding: '0.1rem 0.4rem',
                                                            borderRadius: '4px'
                                                        }}>
                                                            {event}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => deleteWebhook(webhook.id)}
                                            style={{
                                                width: '32px',
                                                height: '32px',
                                                borderRadius: '8px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                background: 'rgba(255, 255, 255, 0.03)',
                                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                                color: 'rgba(255, 255, 255, 0.3)',
                                                cursor: 'pointer',
                                                transition: 'all 0.2s'
                                            }}
                                            onMouseEnter={(e) => {
                                                e.currentTarget.style.background = 'rgba(255, 75, 43, 0.1)';
                                                e.currentTarget.style.color = '#FF4B2B';
                                                e.currentTarget.style.borderColor = 'rgba(255, 75, 43, 0.2)';
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                                                e.currentTarget.style.color = 'rgba(255, 255, 255, 0.3)';
                                                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                                            }}
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    </motion.div>
                )}

                {activeTab === 'settings' && (
                    <motion.div
                        key="settings"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                    >
                        <h2 style={{
                            fontSize: '1.5rem',
                            fontWeight: 700,
                            marginBottom: '1.5rem',
                            color: '#FFFFFF',
                            fontFamily: "'Inter', sans-serif",
                            position: 'relative',
                            zIndex: 1
                        }}>Settings</h2>
                        <div className="glass-panel" style={{
                            padding: isTelegram ? '1.5rem' : '2.5rem',
                            position: 'relative',
                            zIndex: 1,
                            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)'
                        }}>
                            <div style={{
                                marginBottom: '2.5rem',
                                paddingBottom: '2.5rem',
                                borderBottom: '1px solid rgba(255, 255, 255, 0.05)'
                            }}>
                                <label style={{
                                    display: 'block',
                                    marginBottom: '1rem',
                                    fontWeight: 800,
                                    fontSize: '0.75rem',
                                    color: '#00F0FF',
                                    fontFamily: "'JetBrains Mono', monospace",
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.15em'
                                }}>ACCOUNT_EMAIL</label>
                                <div style={{
                                    padding: '1.25rem 1.5rem',
                                    borderRadius: '16px',
                                    background: 'rgba(0, 0, 0, 0.4)',
                                    border: '1px solid rgba(255, 255, 255, 0.05)',
                                    color: 'rgba(255, 255, 255, 0.8)',
                                    fontSize: '1.1rem',
                                    fontFamily: "'Inter', sans-serif",
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '1rem',
                                    boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.2)'
                                }}>
                                    <User size={20} color="rgba(255, 255, 255, 0.2)" />
                                    {user.email}
                                </div>
                            </div>
                            <div style={{
                                marginBottom: '2.5rem',
                                paddingBottom: '2.5rem',
                                borderBottom: '1px solid rgba(255, 255, 255, 0.05)'
                            }}>
                                <label style={{
                                    display: 'block',
                                    marginBottom: '1rem',
                                    fontWeight: 800,
                                    fontSize: '0.75rem',
                                    color: '#00F0FF',
                                    fontFamily: "'JetBrains Mono', monospace",
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.15em'
                                }}>ACCOUNT_ID</label>
                                <div style={{
                                    padding: '1.25rem 1.5rem',
                                    borderRadius: '16px',
                                    background: 'rgba(0, 0, 0, 0.4)',
                                    border: '1px solid rgba(255, 255, 255, 0.05)',
                                    color: 'rgba(255, 255, 255, 0.8)',
                                    fontSize: '1rem',
                                    fontFamily: "'JetBrains Mono', monospace",
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.2)'
                                }}>
                                    <span>{user.id}</span>
                                    <button
                                        onClick={() => copyToClipboard(user.id, 'user-id')}
                                        style={{
                                            background: 'none',
                                            border: 'none',
                                            color: copiedKey === 'user-id' ? '#00E676' : 'rgba(255, 255, 255, 0.3)',
                                            cursor: 'pointer',
                                            padding: '4px'
                                        }}
                                    >
                                        {copiedKey === 'user-id' ? <Check size={18} /> : <Copy size={18} />}
                                    </button>
                                </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: isTelegram ? '1fr' : '1fr 1fr', gap: '2rem' }}>
                                <div>
                                    <label style={{
                                        display: 'block',
                                        marginBottom: '0.75rem',
                                        fontWeight: 800,
                                        fontSize: '0.7rem',
                                        color: 'rgba(255, 255, 255, 0.3)',
                                        fontFamily: "'JetBrains Mono', monospace",
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.1em'
                                    }}>MEMBER_SINCE</label>
                                    <p style={{
                                        color: '#FFFFFF',
                                        fontSize: '0.9rem',
                                        fontFamily: "'JetBrains Mono', monospace"
                                    }}>
                                        {new Date(user.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                                    </p>
                                </div>
                                {user.last_login && (
                                    <div>
                                        <label style={{
                                            display: 'block',
                                            marginBottom: '0.75rem',
                                            fontWeight: 800,
                                            fontSize: '0.7rem',
                                            color: 'rgba(255, 255, 255, 0.3)',
                                            fontFamily: "'JetBrains Mono', monospace",
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.1em'
                                        }}>PREVIOUS_SESSION</label>
                                        <p style={{
                                            color: '#FFFFFF',
                                            fontSize: '0.9rem',
                                            fontFamily: "'JetBrains Mono', monospace"
                                        }}>
                                            {new Date(user.last_login).toLocaleString()}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

function LoginForm({ onSuccess }: { onSuccess: () => void }) {
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [showToast, setShowToast] = useState(false);
    const [toastMessage, setToastMessage] = useState('Coming Soon!');

    useEffect(() => {
        // Initialize Google Identity Services
        window.handleGoogleResponse = async (response: any) => {
            setLoading(true);
            try {
                const res = await fetch('/api/v2/auth/google', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ credential: response.credential })
                });
                const data = await res.json();
                if (data.success) {
                    onSuccess();
                } else {
                    setError(data.error?.message || 'Google Auth Failed');
                }
            } catch (err) {
                setError('Google Auth Error');
            } finally {
                setLoading(false);
            }
        };
    }, [onSuccess]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const endpoint = isLogin ? '/api/v2/auth/login' : '/api/v2/auth/register';
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            const data = await res.json();

            if (res.ok) {
                onSuccess();
            } else {
                setError(data.error?.message || 'An error occurred');
            }
        } catch (err) {
            setError('Network error. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleSocialLogin = (provider: string) => {
        if (provider === 'google') {
            if (window.google) {
                window.google.accounts.id.initialize({
                    client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '',
                    callback: window.handleGoogleResponse
                });
                window.google.accounts.id.prompt();
            } else {
                setError('Google Script not loaded');
            }
        } else if (provider === 'telegram') {
            // Check if we are in a Mini App
            const isMiniApp = typeof window !== 'undefined' && (window as any).Telegram?.WebApp?.initData;
            if (isMiniApp) {
                // Relogin/Auto-login already handled by parent ClientLayout or can be re-triggered
                setToastMessage('Auto-authenticating via Telegram...');
                setShowToast(true);
                setTimeout(() => {
                    setShowToast(false);
                    onSuccess();
                }, 2000);
            } else {
                // Standalone fallback: Redirect to bot
                window.location.href = 'https://t.me/Hunter_Supports'; // Or a dedicated login bot
            }
        } else {
            setToastMessage('Coming Soon!');
            setShowToast(true);
            setTimeout(() => setShowToast(false), 3000);
        }
    };

    // Telegram Icon SVG Component
    const TelegramIcon = () => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM16.64 8.8C16.49 10.38 15.84 14.19 15.51 15.96C15.37 16.71 15.09 16.96 14.83 16.99C14.25 17.04 13.81 16.61 13.25 16.24C12.37 15.66 11.87 15.3 11.02 14.74C10.03 14.09 10.67 13.73 11.23 13.15C11.38 13 13.92 10.69 13.97 10.48C13.98 10.45 13.98 10.35 13.92 10.3C13.86 10.25 13.78 10.27 13.72 10.28C13.63 10.3 12.33 11.16 9.81 12.86C9.44 13.11 9.11 13.23 8.81 13.23C8.48 13.22 7.84 13.04 7.37 12.89C6.79 12.7 6.32 12.6 6.36 12.28C6.38 12.11 6.61 11.94 7.06 11.75C9.84 10.54 11.7 9.74 12.64 9.35C15.31 8.24 15.87 8.05 16.23 8.05C16.31 8.05 16.49 8.07 16.61 8.17C16.71 8.25 16.74 8.36 16.75 8.44C16.76 8.52 16.7 8.71 16.64 8.8Z" fill="#24A1DE" />
        </svg>
    );

    // Google Icon SVG Component
    const GoogleIcon = () => (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M17.64 9.20454C17.64 8.56636 17.5827 7.95272 17.4764 7.36363H9V10.845H13.8436C13.635 11.97 13.0009 12.9231 12.0477 13.5613V15.8195H14.9564C16.6582 14.2527 17.64 11.9454 17.64 9.20454Z" fill="#4285F4" />
            <path d="M9 18C11.43 18 13.467 17.1941 14.9564 15.8195L12.0477 13.5613C11.2418 14.1013 10.2109 14.4204 9 14.4204C6.65454 14.4204 4.67182 12.8372 3.96409 10.71H0.957275V13.0418C2.43818 15.9831 5.48182 18 9 18Z" fill="#34A853" />
            <path d="M3.96409 10.71C3.78409 10.17 3.68182 9.59318 3.68182 9C3.68182 8.40681 3.78409 7.83 3.96409 7.29V4.95818H0.957273C0.347727 6.17318 0 7.54772 0 9C0 10.4523 0.347727 11.8268 0.957273 13.0418L3.96409 10.71Z" fill="#FBBC05" />
            <path d="M9 3.57955C10.3214 3.57955 11.5077 4.03364 12.4405 4.92545L15.0218 2.34409C13.4632 0.891818 11.4259 0 9 0C5.48182 0 2.43818 2.01682 0.957275 4.95818L3.96409 7.29C4.67182 5.16273 6.65454 3.57955 9 3.57955Z" fill="#EA4335" />
        </svg>
    );

    return (
        <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: '100vh',
            padding: '2rem',
            background: '#000000',
            position: 'relative',
            fontFamily: "'Inter', sans-serif"
        }}>
            {/* Decorative Technical Elements */}
            <div style={{
                position: 'absolute',
                top: '2rem',
                left: '2rem',
                color: 'rgba(0, 240, 255, 0.1)',
                fontSize: '24px',
                fontFamily: 'monospace',
                fontWeight: 'bold',
                zIndex: 0,
                pointerEvents: 'none'
            }}>+</div>
            <div style={{
                position: 'absolute',
                top: '2rem',
                right: '2rem',
                color: 'rgba(0, 240, 255, 0.1)',
                fontSize: '24px',
                fontFamily: 'monospace',
                fontWeight: 'bold',
                zIndex: 0,
                pointerEvents: 'none'
            }}>×</div>
            <div style={{
                position: 'absolute',
                bottom: '2rem',
                left: '2rem',
                color: 'rgba(0, 240, 255, 0.1)',
                fontSize: '24px',
                fontFamily: 'monospace',
                fontWeight: 'bold',
                zIndex: 0,
                pointerEvents: 'none'
            }}>+</div>
            <div style={{
                position: 'absolute',
                bottom: '2rem',
                right: '2rem',
                color: 'rgba(0, 240, 255, 0.1)',
                fontSize: '24px',
                fontFamily: 'monospace',
                fontWeight: 'bold',
                zIndex: 0,
                pointerEvents: 'none'
            }}>×</div>

            {/* Toast Notification */}
            <AnimatePresence>
                {showToast && (
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        style={{
                            position: 'fixed',
                            top: '2rem',
                            right: '2rem',
                            background: 'rgba(0, 240, 255, 0.1)',
                            border: '1px solid #00F0FF',
                            borderRadius: '12px',
                            padding: '1rem 1.5rem',
                            color: '#00F0FF',
                            fontFamily: "'Inter', sans-serif",
                            fontWeight: '600',
                            zIndex: 1000,
                            boxShadow: '0 0 12px rgba(0, 240, 255, 0.3)',
                            backdropFilter: 'blur(20px)'
                        }}
                    >
                        {toastMessage}
                    </motion.div>
                )}
            </AnimatePresence>

            <div style={{
                width: '100%',
                maxWidth: '400px',
                padding: '2.5rem',
                borderRadius: '24px',
                background: 'rgba(255, 255, 255, 0.03)',
                backdropFilter: 'blur(24px)',
                WebkitBackdropFilter: 'blur(24px)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                boxShadow: '0 0 20px rgba(0, 240, 255, 0.1)',
                position: 'relative',
                zIndex: 1
            }}>
                <h1 style={{
                    fontSize: '2rem',
                    fontWeight: 900,
                    marginBottom: '0.5rem',
                    textAlign: 'center',
                    color: '#FFFFFF',
                    fontFamily: "'Inter', sans-serif"
                }}>
                    {isLogin ? 'Login' : 'Sign Up'}
                </h1>
                <p style={{
                    color: 'rgba(255, 255, 255, 0.6)',
                    textAlign: 'center',
                    marginBottom: '2rem',
                    fontFamily: "'Inter', sans-serif"
                }}>
                    {isLogin ? 'Welcome back!' : 'Create your account'}
                </p>

                {error && (
                    <div style={{
                        padding: '0.75rem',
                        borderRadius: '12px',
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        color: '#ef4444',
                        marginBottom: '1rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        fontSize: '0.9rem',
                        fontFamily: "'Inter', sans-serif"
                    }}>
                        <AlertCircle size={16} />
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <input
                        type="email"
                        placeholder="Email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        style={{
                            padding: '0.875rem',
                            borderRadius: '12px',
                            background: 'rgba(0, 0, 0, 0.3)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            color: '#FFFFFF',
                            fontSize: '1rem',
                            fontFamily: "'Inter', sans-serif",
                            transition: 'all 0.3s',
                            outline: 'none'
                        }}
                        onFocus={(e) => {
                            e.currentTarget.style.borderColor = '#00F0FF';
                            e.currentTarget.style.boxShadow = '0 0 8px rgba(0, 240, 255, 0.2)';
                        }}
                        onBlur={(e) => {
                            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                            e.currentTarget.style.boxShadow = 'none';
                        }}
                    />
                    <input
                        type="password"
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={8}
                        style={{
                            padding: '0.875rem',
                            borderRadius: '12px',
                            background: 'rgba(0, 0, 0, 0.3)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            color: '#FFFFFF',
                            fontSize: '1rem',
                            fontFamily: "'Inter', sans-serif",
                            transition: 'all 0.3s',
                            outline: 'none'
                        }}
                        onFocus={(e) => {
                            e.currentTarget.style.borderColor = '#00F0FF';
                            e.currentTarget.style.boxShadow = '0 0 8px rgba(0, 240, 255, 0.2)';
                        }}
                        onBlur={(e) => {
                            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                            e.currentTarget.style.boxShadow = 'none';
                        }}
                    />
                    <button
                        type="submit"
                        disabled={loading}
                        style={{
                            padding: '0.875rem',
                            borderRadius: '12px',
                            background: '#00F0FF',
                            border: 'none',
                            color: '#000000',
                            fontSize: '1rem',
                            fontWeight: 700,
                            cursor: loading ? 'not-allowed' : 'pointer',
                            opacity: loading ? 0.6 : 1,
                            fontFamily: "'Inter', sans-serif",
                            transition: 'all 0.3s',
                            boxShadow: '0 0 12px rgba(0, 240, 255, 0.3)'
                        }}
                        onMouseEnter={(e) => {
                            if (!loading) {
                                e.currentTarget.style.boxShadow = '0 0 20px rgba(0, 240, 255, 0.5)';
                                e.currentTarget.style.transform = 'translateY(-1px)';
                            }
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.boxShadow = '0 0 12px rgba(0, 240, 255, 0.3)';
                            e.currentTarget.style.transform = 'translateY(0)';
                        }}
                    >
                        {loading ? 'Please wait...' : (isLogin ? 'Login' : 'Sign Up')}
                    </button>
                </form>

                {/* Social Login Buttons */}
                <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <button
                        type="button"
                        onClick={() => handleSocialLogin('telegram')}
                        style={{
                            padding: '0.875rem',
                            borderRadius: '12px',
                            background: '#000000',
                            border: '1px solid rgba(255, 255, 255, 0.2)',
                            color: '#FFFFFF',
                            fontSize: '0.95rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            fontFamily: "'Inter', sans-serif",
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.75rem',
                            transition: 'all 0.3s'
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.4)';
                            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                            e.currentTarget.style.background = '#000000';
                        }}
                    >
                        <TelegramIcon />
                        Continue with Telegram
                    </button>
                    <button
                        type="button"
                        onClick={() => handleSocialLogin('google')}
                        style={{
                            padding: '0.875rem',
                            borderRadius: '12px',
                            background: '#000000',
                            border: '1px solid rgba(255, 255, 255, 0.2)',
                            color: '#FFFFFF',
                            fontSize: '0.95rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            fontFamily: "'Inter', sans-serif",
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.75rem',
                            transition: 'all 0.3s'
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.4)';
                            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                            e.currentTarget.style.background = '#000000';
                        }}
                    >
                        <GoogleIcon />
                        Continue with Google
                    </button>
                </div>

                <p style={{
                    textAlign: 'center',
                    marginTop: '1.5rem',
                    color: 'rgba(255, 255, 255, 0.6)',
                    fontFamily: "'Inter', sans-serif"
                }}>
                    {isLogin ? "Don't have an account? " : 'Already have an account? '}
                    <button
                        onClick={() => {
                            setIsLogin(!isLogin);
                            setError('');
                        }}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: '#00F0FF',
                            cursor: 'pointer',
                            textDecoration: 'underline',
                            fontFamily: "'Inter', sans-serif",
                            fontWeight: 600,
                            transition: 'all 0.3s'
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.textShadow = '0 0 8px rgba(0, 240, 255, 0.5)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.textShadow = 'none';
                        }}
                    >
                        {isLogin ? 'Sign up' : 'Login'}
                    </button>
                </p>

                <div style={{ marginTop: '2rem', textAlign: 'center' }}>
                    <Link href="/" style={{
                        color: 'rgba(255, 255, 255, 0.6)',
                        textDecoration: 'none',
                        fontSize: '0.9rem',
                        fontFamily: "'Inter', sans-serif",
                        transition: 'all 0.3s'
                    }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.color = '#00F0FF';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.color = 'rgba(255, 255, 255, 0.6)';
                        }}
                    >
                        ← Back to home
                    </Link>
                </div>
            </div>
        </div>
    );
}
