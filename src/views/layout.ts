import type { I18nManager } from '@/api';
import { escapeAttr, escapeHtml } from '../utils/html';
import { icon, type NavItem } from './ui';

export function renderLayout(
	title: string,
	content: string,
	i18n: I18nManager,
	lang: string,
	isAdmin = false,
	activePage = '',
): string {
	const baseItems: NavItem[] = [
		{
			href: '/dashboard',
			label: 'Overview',
			id: 'dashboard',
			icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
		},
	];

	const groupItem: NavItem = {
		href: '/groups',
		label: 'Groups',
		id: 'groups',
		icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z',
	};

	const adminItems: NavItem[] = [
		{
			href: '/ops',
			label: 'Control Panel',
			id: 'ops',
			icon: 'M13 10V3L4 14h7v7l9-11h-7z',
		},
		groupItem,
		{
			href: '/plugins',
			label: 'Plugins',
			id: 'plugins',
			icon: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z',
		},
		{
			href: '/permissions',
			label: 'Permissions',
			id: 'permissions',
			icon: 'M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z',
		},
		{
			href: '/config',
			label: 'Config',
			id: 'config',
			icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
		},
	];

	const navItems = isAdmin ? [...baseItems, ...adminItems] : [...baseItems, groupItem];

	return `<!DOCTYPE html>
<html lang="${escapeAttr(lang)}">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>${escapeHtml(title)} - alden-bot Dashboard</title>
	<link rel="stylesheet" href="/assets/dashboard.css">
	<script defer src="/assets/dashboard.js"></script>
</head>
<body>
	<div class="mobile-topbar">
		<button type="button" class="btn btn-ghost" onclick="toggleSidebar()" aria-label="Open navigation">
			${icon('M4 6h16M4 12h16M4 18h16')}
		</button>
		<strong>alden-bot</strong>
		<button hx-post="/api/logout" class="btn btn-ghost" aria-label="Logout">
			${icon('M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1')}
		</button>
	</div>

	<div id="sidebar-overlay" class="mobile-overlay" onclick="toggleSidebar()"></div>

	<div class="app-shell">
		<aside id="sidebar" class="sidebar">
			<div class="sidebar-brand">
				<h1 class="sidebar-title">alden-bot</h1>
				<p class="sidebar-subtitle">Dashboard</p>
			</div>
			<nav class="sidebar-nav">
				${renderNav(navItems, activePage)}
			</nav>
			<div class="sidebar-footer">
				<button hx-post="/api/logout" class="logout-button">
					${icon('M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1')}
					<span>Logout</span>
				</button>
			</div>
		</aside>

		<main class="page">
			<div class="page-inner">
				${content}
			</div>
		</main>
	</div>
</body>
</html>`;
}

function renderNav(items: NavItem[], activePage: string): string {
	return items
		.map(
			(item) => `
			<a href="${escapeAttr(item.href)}" class="nav-link${activePage === item.id ? ' is-active' : ''}">
				${icon(item.icon)}
				<span>${escapeHtml(item.label)}</span>
			</a>`,
		)
		.join('');
}
