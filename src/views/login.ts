import type { I18nManager } from '@/api';
import { escapeAttr } from '../utils/html';
import { icon } from './ui';

export function renderLogin(i18n: I18nManager, lang: string): string {
	return `<!DOCTYPE html>
<html lang="${escapeAttr(lang)}">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Login - alden-bot Dashboard</title>
	<link rel="stylesheet" href="/assets/dashboard.css">
	<script defer src="/assets/dashboard.js"></script>
</head>
<body>
	<main class="login-page">
		<section class="login-card">
			<div class="login-brand">
				<div class="login-mark">
					${icon('M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8')}
				</div>
				<h1 class="login-title">alden-bot</h1>
				<p class="login-subtitle">Dashboard login</p>
			</div>

			<form action="/api/login" method="post" hx-post="/api/login" hx-target="#login-result" hx-swap="innerHTML" class="field-stack">
				<div>
					<label for="otp" class="field-label">OTP code</label>
					<input
						type="text"
						id="otp"
						name="otp"
						placeholder="12345678"
						maxlength="8"
						pattern="[0-9]{8}"
						required
						autofocus
						class="input input-code"
					>
				</div>
				<p class="muted">
					Send <code class="mono-pill">/dashboard</code> in DM to get your OTP.
				</p>
				<button type="submit" class="btn btn-primary btn-block">Login</button>
			</form>
			<div id="login-result"></div>
		</section>
	</main>
</body>
</html>`;
}
