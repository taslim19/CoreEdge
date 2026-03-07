"use client";

import React, { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import {
    Upload, Copy, Check, Shield, Zap,
    Globe, History, QrCode, Settings,
    Code2, ArrowRight, ExternalLink, Image as ImageIcon,
    Sun, Moon, MessageSquare, LayoutDashboard
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';

interface HistoryItem {
    id: string;
    url: string;
    timestamp: number;
}

export default function Home() {
    const [isDragging, setIsDragging] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState<number | null>(null);
    const [result, setResult] = useState<{ id: string; url: string } | null>(null);
    const [copied, setCopied] = useState(false);
    const [customId, setCustomId] = useState('');
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [showQr, setShowQr] = useState(false);
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const [showToast, setShowToast] = useState(false);
    const [theme, setTheme] = useState<'dark' | 'light'>('dark');
    const [isTelegram, setIsTelegram] = useState(false);

    // Load history and theme from localStorage
    useEffect(() => {
        const savedHistory = localStorage.getItem('voltedge_history');
        if (savedHistory) {
            try { setHistory(JSON.parse(savedHistory)); } catch (e) { console.error('Failed to load history', e); }
        }

        const savedTheme = localStorage.getItem('voltedge_theme') as 'dark' | 'light';
        if (savedTheme) {
            setTheme(savedTheme);
            document.documentElement.setAttribute('data-theme', savedTheme);
        } else {
            // Default to dark if no theme is saved
            document.documentElement.setAttribute('data-theme', 'dark');
        }

        // Detect Telegram environment
        if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp?.initData) {
            setIsTelegram(true);
        }
    }, []);

    const toggleTheme = () => {
        const newTheme = theme === 'dark' ? 'light' : 'dark';
        setTheme(newTheme);
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('voltedge_theme', newTheme);
    };

    const saveToHistory = (item: HistoryItem) => {
        const newHistory = [item, ...history].slice(0, 5); // Keep last 5
        setHistory(newHistory);
        localStorage.setItem('voltedge_history', JSON.stringify(newHistory));
    };

    const copyToClipboard = (text: string) => {
        const performCopy = () => {
            setCopied(true);
            setShowToast(true);
            setTimeout(() => {
                setCopied(false);
                setShowToast(false);
            }, 2000);
        };

        if (navigator.clipboard) {
            navigator.clipboard.writeText(text).then(performCopy);
        } else {
            const textArea = document.createElement("textarea");
            textArea.value = text;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            performCopy();
            document.body.removeChild(textArea);
        }
    };

    const uploadFile = async (file: File) => {
        if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
            alert('Please upload an image or video file');
            return;
        }

        // 2GB Limit Check
        if (file.size > 2 * 1024 * 1024 * 1024) {
            alert('File too large. Max size is 2GB.');
            return;
        }

        setUploading(true);
        setUploadProgress(0);
        setResult(null);
        setShowQr(false);

        // Use direct-to-R2 for files larger than 10MB to bypass Vercel's body limit
        const LARGE_FILE_THRESHOLD = 10 * 1024 * 1024; // 10MB
        const useDirectUpload = file.size > LARGE_FILE_THRESHOLD;

        try {
            if (useDirectUpload) {
                // Direct-to-R2 upload flow
                // Step 1: Initialize upload and get presigned URL
                setUploadProgress(5);
                const initResponse = await fetch('/api/v1/upload/init', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        fileName: file.name,
                        fileSize: file.size,
                        contentType: file.type,
                        customId: customId || undefined
                    })
                });

                const initData = await initResponse.json();
                if (!initData.success) {
                    throw new Error(initData.error?.message || 'Failed to initialize upload');
                }

                const { id, uploadUrl, publicUrl, objectKey } = initData.data;

                // Step 2: Upload directly to R2 using presigned URL
                setUploadProgress(10);
                await new Promise<void>((resolve, reject) => {
                    const xhr = new XMLHttpRequest();

                    xhr.open('PUT', uploadUrl, true);
                    xhr.setRequestHeader('Content-Type', file.type);

                    xhr.upload.onprogress = (event) => {
                        if (event.lengthComputable) {
                            // Map progress from 10% to 90% (leaving 10% for completion)
                            const uploadPercent = Math.round((event.loaded / event.total) * 80);
                            setUploadProgress(10 + uploadPercent);
                        }
                    };

                    xhr.onload = () => {
                        if (xhr.status >= 200 && xhr.status < 300) {
                            resolve();
                        } else {
                            reject(new Error(`Upload failed with status ${xhr.status}`));
                        }
                    };

                    xhr.onerror = () => {
                        reject(new Error('Network error during upload'));
                    };

                    xhr.onabort = () => {
                        reject(new Error('Upload aborted'));
                    };

                    xhr.send(file);
                });

                // Step 3: Complete the upload (save record)
                setUploadProgress(95);
                const completeResponse = await fetch('/api/v1/upload/complete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        id,
                        objectKey,
                        fileSize: file.size,
                        contentType: file.type,
                        storageUrl: publicUrl
                    })
                });

                const completeData = await completeResponse.json();
                if (!completeData.success) {
                    throw new Error(completeData.error?.message || 'Failed to complete upload');
                }

                setUploadProgress(100);
                const data = completeData.data;
                setResult(data);
                saveToHistory({
                    id: data.id,
                    url: data.url,
                    timestamp: Date.now()
                });
                setCustomId('');
            } else {
                // Small file: use existing Vercel flow
                const formData = new FormData();
                formData.append('file', file);
                if (customId) formData.append('customId', customId);

                await new Promise<void>((resolve, reject) => {
                    const xhr = new XMLHttpRequest();

                    xhr.open('POST', '/api/v1/upload', true);

                    xhr.upload.onprogress = (event) => {
                        if (event.lengthComputable) {
                            const percent = Math.round((event.loaded / event.total) * 100);
                            setUploadProgress(percent);
                        }
                    };

                    xhr.onload = () => {
                        try {
                            const json = JSON.parse(xhr.responseText || '{}');
                            if (!json.success) {
                                reject(new Error(json.error?.message || 'Upload failed'));
                                return;
                            }
                            const data = json.data;
                            setResult(data);
                            saveToHistory({
                                id: data.id,
                                url: data.url,
                                timestamp: Date.now()
                            });
                            setCustomId('');
                            resolve();
                        } catch (err) {
                            reject(err);
                        }
                    };

                    xhr.onerror = () => {
                        reject(new Error('Network error during upload'));
                    };

                    xhr.onabort = () => {
                        reject(new Error('Upload aborted'));
                    };

                    xhr.send(formData);
                });
            }
        } catch (err: any) {
            alert(err.message || 'Upload failed');
        } finally {
            setUploading(false);
            setUploadProgress(null);
            setIsDragging(false);
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = () => setIsDragging(false);

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file) uploadFile(file);
    };

    const handleUpload = (file: File) => {
        uploadFile(file);
    };

    return (
        <>
            {/* Command Bar Navigation */}
            <motion.nav
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="main-nav"
                style={{
                    position: 'fixed',
                    top: '1.5rem',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: 'var(--panel-bg)',
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '100px',
                    padding: '10px 24px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '24px',
                    zIndex: 9999,
                    boxShadow: '0 10px 30px -10px rgba(0, 0, 0, 0.5)',
                    whiteSpace: 'nowrap'
                }}
            >
                <Link href="/" className="nav-logo" style={{
                    color: 'var(--text-main)',
                    textDecoration: 'none',
                    fontSize: '1.4rem',
                    letterSpacing: '-0.02em',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    fontFamily: "'Inter', sans-serif",
                    flexShrink: 0
                }}>
                    <Zap
                        size={24}
                        fill="#00F0FF"
                        color="#00F0FF"
                        className="logo-pulse"
                        style={{
                            filter: 'drop-shadow(0 0 4px rgba(0, 240, 255, 0.5))'
                        }}
                    />
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0' }}>
                        <span style={{
                            fontWeight: '500',
                            color: 'var(--text-main)',
                            letterSpacing: '-0.05em'
                        }}>Volt</span>
                        <span style={{
                            fontWeight: '900',
                            background: `linear-gradient(to right, var(--text-main), var(--accent-cyan))`,
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            backgroundClip: 'text',
                            letterSpacing: '-0.05em'
                        }}>Edge</span>
                    </span>
                </Link>
                <Link href="/docs" className="nav-link" style={{
                    color: 'var(--text-muted)',
                    textDecoration: 'none',
                    fontSize: '0.9rem',
                    fontWeight: '500',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'all 0.2s ease',
                    fontFamily: "'Inter', sans-serif",
                    whiteSpace: 'nowrap'
                }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.color = '#00F0FF';
                        e.currentTarget.style.textShadow = '0 0 10px rgba(0, 240, 255, 0.5)';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.color = 'var(--text-muted)';
                        e.currentTarget.style.textShadow = 'none';
                    }}
                >
                    <Code2 size={18} className="icon-only" />
                    <span className="nav-link-text">API Docs</span>
                </Link>

                <Link href="/dashboard" className="nav-link" style={{
                    color: 'var(--text-muted)',
                    textDecoration: 'none',
                    fontSize: '0.9rem',
                    fontWeight: '500',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'all 0.2s ease',
                    fontFamily: "'Inter', sans-serif",
                    whiteSpace: 'nowrap'
                }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.color = '#00F0FF';
                        e.currentTarget.style.textShadow = '0 0 10px rgba(0, 240, 255, 0.5)';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.color = 'var(--text-muted)';
                        e.currentTarget.style.textShadow = 'none';
                    }}
                >
                    <LayoutDashboard size={18} className="icon-only" />
                    <span className="nav-link-text">Dashboard</span>
                </Link>

                <button
                    onClick={toggleTheme}
                    className="theme-toggle"
                    style={{
                        background: 'rgba(255, 255, 255, 0.03)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '10px',
                        width: '36px',
                        height: '36px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        color: 'var(--accent-cyan)',
                        transition: 'all 0.2s ease',
                        flexShrink: 0
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = '#00F0FF';
                        e.currentTarget.style.boxShadow = '0 0 20px var(--glow-cyan-intense)';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'var(--border-color)';
                        e.currentTarget.style.boxShadow = '0 0 10px var(--glow-cyan)';
                    }}
                >
                    {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                </button>
            </motion.nav>

            <main className="main-container">
                <div className="hero-section">
                    <header className="hero">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.5 }}
                        >
                            {isTelegram && (
                                <div style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    gap: '1rem',
                                    marginBottom: '2rem'
                                }}>
                                    <div style={{
                                        background: 'rgba(0, 240, 255, 0.1)',
                                        padding: '8px 16px',
                                        borderRadius: '100px',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        border: '1px solid rgba(0, 240, 255, 0.2)',
                                        color: '#00F0FF',
                                        fontSize: '0.85rem',
                                        fontWeight: '600',
                                        fontFamily: 'JetBrains Mono, monospace'
                                    }}>
                                        <Zap size={14} fill="#00F0FF" color="#00F0FF" />
                                        <span>Now powered by Upstash & Telegram</span>
                                    </div>
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.9 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        transition={{ delay: 0.3, duration: 0.5 }}
                                        className="cyber-pulse"
                                        style={{
                                            background: 'rgba(0, 240, 255, 0.1)',
                                            padding: '4px 12px',
                                            borderRadius: '100px',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            border: '1px solid rgba(0, 240, 255, 0.3)',
                                            color: '#00F0FF',
                                            fontSize: '0.7rem',
                                            fontWeight: '800',
                                            letterSpacing: '0.1em',
                                            textTransform: 'uppercase'
                                        }}
                                    >
                                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#00F0FF' }} />
                                        BETA
                                    </motion.div>
                                </div>
                            )}

                            <h1 className="hero-title">
                                Media hosted,<br />
                                at the <span className="title-accent">edge</span>.
                            </h1>
                            <p className="hero-subtitle">
                                Zero storage. Lightning speed. Infinity scale.
                            </p>
                        </motion.div>
                    </header>

                    <motion.div
                        className="upload-card"
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.6 }}
                    >
                        <div className="input-group" style={{ marginBottom: '1.5rem', position: 'relative' }}>
                            <i className="input-icon" style={{
                                position: 'absolute',
                                left: '12px',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                color: 'var(--text-muted)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px'
                            }}><Settings size={18} /></i>
                            <input
                                type="text"
                                placeholder="Custom File Name (Optional)"
                                value={customId}
                                onChange={(e) => setCustomId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                                className="custom-id-input"
                                style={{
                                    width: '100%',
                                    background: 'var(--input-bg)',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: '16px',
                                    padding: '12px 12px 12px 40px',
                                    color: 'var(--text-main)',
                                    fontSize: '0.9rem',
                                    outline: 'none',
                                    transition: 'all 0.3s',
                                    fontFamily: 'JetBrains Mono, monospace'
                                }}
                                onFocus={(e) => {
                                    e.target.style.borderColor = '#00F0FF';
                                    e.target.style.boxShadow = '0 0 10px rgba(0, 240, 255, 0.3)';
                                }}
                                onBlur={(e) => {
                                    e.target.style.borderColor = 'var(--border-color)';
                                    e.target.style.boxShadow = 'none';
                                }}
                            />
                        </div>

                        <div
                            className={`drop-zone ${isDragging ? 'active' : ''} ${uploading ? 'uploading' : ''}`}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            onClick={() => !uploading && document.getElementById('fileInput')?.click()}
                        >
                            <input
                                type="file"
                                id="fileInput"
                                hidden
                                accept="image/*,video/*"
                                onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
                            />

                            <div className="drop-zone-content" style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: '1rem',
                                position: 'relative',
                                zIndex: 1
                            }}>
                                <div className="upload-icon-wrapper" style={{
                                    position: 'relative',
                                    width: '80px',
                                    height: '80px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}>
                                    <div className="scan-line" style={{
                                        position: 'absolute',
                                        width: '100%',
                                        height: '2px',
                                        background: 'linear-gradient(90deg, transparent, #00F0FF, transparent)',
                                        animation: 'scan 2s infinite linear',
                                        opacity: uploading ? 1 : 0,
                                        transition: 'opacity 0.3s ease'
                                    }} />
                                    {uploading ? (
                                        <div className="progress-container" style={{
                                            position: 'relative',
                                            width: '80px',
                                            height: '80px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                        }}>
                                            <div className="progress-value" style={{
                                                position: 'absolute',
                                                color: 'var(--accent-cyan)',
                                                fontSize: '1rem',
                                                fontWeight: '600',
                                                fontFamily: 'JetBrains Mono, monospace'
                                            }}>{uploadProgress || 0}%</div>
                                            <svg className="progress-ring" width="80" height="80">
                                                <circle
                                                    className="progress-ring-circle"
                                                    stroke="var(--accent-cyan)"
                                                    strokeWidth="4"
                                                    fill="transparent"
                                                    r="36"
                                                    cx="40"
                                                    cy="40"
                                                    style={{
                                                        strokeDasharray: `${2 * Math.PI * 36}`,
                                                        strokeDashoffset: `${2 * Math.PI * 36 * (1 - (uploadProgress || 0) / 100)}`,
                                                        transition: 'stroke-dashoffset 0.2s ease-out'
                                                    }}
                                                />
                                            </svg>
                                        </div>
                                    ) : (
                                        <div className="icon-pulse" style={{
                                            color: 'var(--accent-cyan)',
                                            filter: 'drop-shadow(0 0 8px #00F0FF) drop-shadow(0 0 16px rgba(0, 240, 255, 0.5))'
                                        }}>
                                            <Upload size={32} />
                                        </div>
                                    )}
                                </div>
                                <div className="drop-zone-text" style={{ textAlign: 'center' }}>
                                    <h3 style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, color: 'var(--text-main)' }}>{uploading ? 'Uploading to Edge...' : 'Drop image or video here'}</h3>
                                    <p style={{
                                        color: 'var(--text-muted)',
                                        opacity: 0.6,
                                        fontSize: '0.8rem',
                                        fontFamily: 'JetBrains Mono, monospace',
                                        letterSpacing: '0.05em'
                                    }}>{uploading ? 'Processing through global node cluster' : 'or click to browse your files'}</p>
                                </div>
                            </div>
                        </div>

                        <AnimatePresence>
                            {result && (
                                <motion.div
                                    className="result-area"
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                >
                                    <div className="link-box" style={{
                                        background: 'var(--input-bg)',
                                        border: '1px solid var(--border-color)',
                                        borderRadius: '16px',
                                        padding: '12px 16px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        gap: '12px'
                                    }}>
                                        <span className="link-text" style={{
                                            fontFamily: 'JetBrains Mono, monospace',
                                            fontSize: '0.85rem',
                                            color: 'var(--accent-cyan)',
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis'
                                        }}>{result.url}</span>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button
                                                className="copy-btn"
                                                onClick={() => setShowQr(!showQr)}
                                                style={{
                                                    background: 'rgba(0, 240, 255, 0.15)',
                                                    border: 'none',
                                                    color: '#00F0FF',
                                                    padding: '10px',
                                                    borderRadius: '14px',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s'
                                                }}
                                                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0, 240, 255, 0.25)'}
                                                onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(0, 240, 255, 0.15)'}
                                            >
                                                <QrCode size={18} />
                                            </button>
                                            <button className="copy-btn" onClick={() => copyToClipboard(result.url)}
                                                style={{
                                                    background: 'rgba(0, 240, 255, 0.15)',
                                                    border: 'none',
                                                    color: '#00F0FF',
                                                    padding: '10px',
                                                    borderRadius: '14px',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s'
                                                }}
                                                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0, 240, 255, 0.25)'}
                                                onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(0, 240, 255, 0.15)'}
                                            >
                                                {copied ? <Check size={18} /> : <Copy size={18} />}
                                            </button>
                                        </div>
                                    </div>

                                    {showQr && (
                                        <motion.div
                                            initial={{ opacity: 0, scale: 0.9 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            style={{
                                                marginTop: '1.5rem',
                                                display: 'flex',
                                                justifyContent: 'center',
                                                background: 'white',
                                                padding: '1.5rem',
                                                borderRadius: '24px',
                                                boxShadow: '0 20px 40px rgba(0,0,0,0.5)'
                                            }}
                                        >
                                            <QRCodeSVG value={result.url} size={180} />
                                        </motion.div>
                                    )}

                                    <div style={{ marginTop: '1rem', textAlign: 'center' }}>
                                        <a href={result.url} target="_blank" rel="noopener noreferrer" style={{
                                            color: '#00F0FF',
                                            fontSize: '0.8rem',
                                            textDecoration: 'none',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '4px',
                                            fontFamily: 'JetBrains Mono, monospace',
                                            textShadow: '0 0 10px rgba(0, 240, 255, 0.5)',
                                            transition: 'all 0.3s'
                                        }}
                                            onMouseEnter={(e) => {
                                                e.currentTarget.style.textShadow = '0 0 20px rgba(0, 240, 255, 0.8)';
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.textShadow = '0 0 10px rgba(0, 240, 255, 0.5)';
                                            }}
                                        >
                                            View Live Link <ExternalLink size={12} />
                                        </a>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>

                    {/* Telegram Bot CTA */}
                    {isTelegram && (
                        <motion.a
                            href="https://t.me/voltedgebot"
                            target="_blank"
                            rel="noopener noreferrer"
                            initial={{ opacity: 0, y: 10 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            style={{
                                marginTop: '2.5rem',
                                textDecoration: 'none',
                                width: '100%',
                                maxWidth: '500px'
                            }}
                        >
                            <div style={{
                                background: 'rgba(59, 130, 246, 0.05)',
                                border: '1px solid rgba(59, 130, 246, 0.2)',
                                padding: '16px 20px',
                                borderRadius: '24px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '15px',
                                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                backdropFilter: 'blur(10px)'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                    <div style={{
                                        width: '44px',
                                        height: '44px',
                                        background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                                        borderRadius: '14px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: 'white'
                                    }}>
                                        <MessageSquare size={20} fill="white" />
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        <span style={{ color: 'var(--text-main)', fontWeight: '600', fontSize: '1rem' }}>Prefer Telegram?</span>
                                        <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Use our bot for instant uploads</span>
                                    </div>
                                </div>
                                <ArrowRight size={18} color="var(--text-muted)" />
                            </div>
                        </motion.a>
                    )}

                    {/* Recently Uploaded */}
                    {history.length > 0 && (
                        <div style={{ marginTop: '2rem', width: '100%', maxWidth: '500px' }}>
                            <button
                                onClick={() => setIsHistoryOpen(!isHistoryOpen)}
                                style={{
                                    width: '100%',
                                    background: 'var(--input-bg)',
                                    border: '1px solid var(--border-color)',
                                    padding: '14px',
                                    borderRadius: '100px',
                                    color: 'var(--text-main)',
                                    fontSize: '0.85rem',
                                    fontWeight: '500',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '10px',
                                    transition: 'all 0.2s'
                                }}
                            >
                                <History size={16} />
                                {isHistoryOpen ? 'Hide History' : 'View Upload History'}
                            </button>

                            <AnimatePresence>
                                {isHistoryOpen && (
                                    <motion.div
                                        initial={{ opacity: 0, y: -10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        style={{ overflow: 'hidden', padding: '1.5rem 0 0' }}
                                    >
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                            {history.map((item) => (
                                                <div key={item.id} style={{
                                                    background: 'var(--history-item-bg)',
                                                    padding: '10px 14px',
                                                    borderRadius: '22px',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    border: '1px solid var(--border-color)',
                                                    transition: 'all 0.2s'
                                                }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flex: 1, overflow: 'hidden' }}>
                                                        <div style={{
                                                            width: '48px',
                                                            height: '48px',
                                                            borderRadius: '14px',
                                                            overflow: 'hidden',
                                                            background: 'rgba(139, 92, 246, 0.1)',
                                                            flexShrink: 0
                                                        }}>
                                                            <img
                                                                src={`/i/${item.id}.jpg`}
                                                                alt="preview"
                                                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                            />
                                                        </div>
                                                        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                                                            <a href={`/i/${item.id}`} target="_blank" style={{ color: 'var(--text-main)', textDecoration: 'none', fontSize: '0.9rem', fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                /i/{item.id}
                                                            </a>
                                                            <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                                                                {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => copyToClipboard(item.url)}
                                                        style={{ background: 'rgba(139, 92, 246, 0.15)', border: 'none', color: '#8b5cf6', padding: '10px', borderRadius: '14px', cursor: 'pointer', transition: 'all 0.2s' }}
                                                        onMouseOver={(e: any) => e.currentTarget.style.background = 'rgba(139, 92, 246, 0.25)'}
                                                        onMouseOut={(e: any) => e.currentTarget.style.background = 'rgba(139, 92, 246, 0.15)'}
                                                    >
                                                        <Copy size={18} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    )}
                </div>

                <div className="features-grid">
                    <motion.div className="feature-card" initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }}>
                        <Zap size={28} color="#8b5cf6" style={{ marginBottom: '1.5rem' }} />
                        <h3 style={{ marginBottom: '0.8rem' }}>Edge Delivery</h3>
                        <p style={{ color: 'var(--card-subtext)', fontSize: '0.9rem', lineHeight: '1.5' }}>Direct-to-CDN redirection ensures your images load instantly for users globally.</p>
                    </motion.div>
                    <motion.div className="feature-card" initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ delay: 0.1 }}>
                        <Shield size={28} color="#06b6d4" style={{ marginBottom: '1.5rem' }} />
                        <h3 style={{ marginBottom: '0.8rem' }}>Privacy Shield</h3>
                        <p style={{ color: 'var(--card-subtext)', fontSize: '0.9rem', lineHeight: '1.5' }}>Advanced privacy protection that keeps your data sources secure, ensuring clean and anonymous sharing links.</p>
                    </motion.div>
                    <motion.div className="feature-card" initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ delay: 0.2 }}>
                        <Code2 size={28} color="#eab308" style={{ marginBottom: '1.5rem' }} />
                        <h3 style={{ marginBottom: '0.8rem' }}>Rich API</h3>
                        <p style={{ color: 'var(--card-subtext)', fontSize: '0.9rem', lineHeight: '1.5' }}>Fully document REST API for programmatic uploads and metadata retrieval.</p>
                    </motion.div>
                </div>

                <footer className="footer">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '20px', marginBottom: '1rem' }}>
                        <Link href="/docs" style={{ color: 'var(--text-muted)' }}>API</Link>
                        <a href="https://github.com/taslim19/CoreEdge" style={{ color: 'var(--text-muted)' }}>GitHub</a>
                        <a href="https://t.me/Hunter_Update" style={{ color: 'var(--text-muted)' }}>Channel</a>
                        <a href="https://t.me/Hunter_Supports" style={{ color: 'var(--text-muted)' }}>Support</a>
                    </div>
                </footer>

                {/* Toast System */}
                <AnimatePresence>
                    {showToast && (
                        <motion.div
                            initial={{ opacity: 0, y: 50, scale: 0.8 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 20, scale: 0.8 }}
                            style={{
                                position: 'fixed',
                                bottom: '3rem',
                                background: 'var(--toast-bg)',
                                backdropFilter: 'blur(20px)',
                                border: '1px solid var(--border-color)',
                                padding: '12px 24px',
                                borderRadius: '100px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '12px',
                                boxShadow: '0 20px 40px rgba(0,0,0,0.1)',
                                zIndex: 1000,
                                color: 'var(--text-main)'
                            }}
                        >
                            <div style={{ background: '#10b981', borderRadius: '50%', padding: '4px', display: 'flex' }}>
                                <Check size={14} color="white" strokeWidth={3} />
                            </div>
                            <span style={{ fontSize: '0.9rem', fontWeight: '500' }}>Copied to clipboard</span>
                        </motion.div>
                    )}
                </AnimatePresence>
            </main>
        </>
    );
}
