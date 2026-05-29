(function () {
	function getCookie(name) {
		const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
		return match ? decodeURIComponent(match[1]) : '';
	}

	function findTarget(el) {
		const selector = el.getAttribute('hx-target');
		if (!selector) return null;
		return document.querySelector(selector);
	}

	function swap(target, html, mode) {
		if (!target) return;
		if (mode === 'outerHTML') {
			target.outerHTML = html;
			return;
		}
		target.innerHTML = html;
	}

	function scrollLog(position, behavior) {
		const log = document.querySelector('.log-pre');
		if (!log) return;
		const target = position === 'bottom' ? log.scrollHeight : 0;
		log.scrollTo({ top: target, behavior: behavior || 'auto' });
	}

	function setBusy(el, busy) {
		el.setAttribute('aria-busy', busy ? 'true' : 'false');
		if (el instanceof HTMLButtonElement || el instanceof HTMLInputElement) {
			el.disabled = busy;
		}
		if (el instanceof HTMLFormElement) {
			el.querySelectorAll('button, input, select').forEach(function (control) {
				control.disabled = busy;
			});
		}
	}

	async function request(el, method, url, body) {
		if (el.getAttribute('hx-confirm') && !confirm(el.getAttribute('hx-confirm'))) return;
		const target = findTarget(el);
		const token = getCookie('csrf_token');
		const headers = { 'X-Requested-With': 'alden-dashboard' };
		if (token) headers['X-CSRF-Token'] = token;
		if (!(body instanceof FormData) && body !== undefined) {
			headers['Content-Type'] = 'application/x-www-form-urlencoded';
		}

		setBusy(el, true);
		try {
			const response = await fetch(url, { method, headers, body });
			const redirect = response.headers.get('HX-Redirect');
			if (redirect) {
				location.href = redirect;
				return;
			}
			const html = await response.text();
			swap(target, html, el.getAttribute('hx-swap') || 'innerHTML');
			if (target?.id === 'log-tail') {
				scrollLog('bottom');
			}
			if (!response.ok && !target) {
				alert(html || 'Request failed');
			}
		} catch (error) {
			if (target) {
				swap(target, '<div class="toast toast-error">Request failed. Check the console or retry.</div>', 'innerHTML');
			} else {
				alert('Request failed');
			}
		} finally {
			setBusy(el, false);
		}
	}

	document.addEventListener('click', function (event) {
		const el = event.target.closest('[hx-get], [hx-post]');
		if (!el || el.tagName === 'FORM') return;

		const url = el.getAttribute('hx-get') || el.getAttribute('hx-post');
		if (!url) return;
		event.preventDefault();

		request(el, el.hasAttribute('hx-get') ? 'GET' : 'POST', url);
	});

	document.addEventListener('submit', function (event) {
		const form = event.target;
		if (!(form instanceof HTMLFormElement)) return;
		const url = form.getAttribute('hx-post') || form.getAttribute('hx-get');
		if (!url) return;
		event.preventDefault();
		request(form, form.hasAttribute('hx-get') ? 'GET' : 'POST', url, new FormData(form));
	});

	document.addEventListener('click', function (event) {
		const button = event.target.closest('[data-copy]');
		if (!button) return;
		event.preventDefault();
		const value = button.getAttribute('data-copy') || '';
		if (!value || !navigator.clipboard) return;
		navigator.clipboard.writeText(value).then(function () {
			button.textContent = 'Copied';
			setTimeout(function () {
				button.textContent = button.getAttribute('data-label') || 'Copy';
			}, 1200);
		});
	});

	document.addEventListener('input', function (event) {
		const input = event.target;
		if (!(input instanceof HTMLInputElement)) return;
		const tableSelector = input.getAttribute('data-filter-table');
		if (!tableSelector) return;
		const query = input.value.trim().toLowerCase();
		document.querySelectorAll(tableSelector + ' tbody tr[data-filter-text]').forEach(function (row) {
			row.hidden = query.length > 0 && !row.getAttribute('data-filter-text').includes(query);
		});
	});

	window.toggleSidebar = function () {
		const sidebar = document.getElementById('sidebar');
		const overlay = document.getElementById('sidebar-overlay');
		if (!sidebar || !overlay) return;
		sidebar.classList.toggle('is-open');
		overlay.classList.toggle('is-open');
	};

	document.addEventListener('click', function (event) {
		const button = event.target.closest('[data-scroll-log]');
		if (!button) return;
		event.preventDefault();
		scrollLog(button.getAttribute('data-scroll-log') === 'bottom' ? 'bottom' : 'top', 'smooth');
	});

	document.addEventListener('DOMContentLoaded', function () {
		scrollLog('bottom');
	});
})();
