/**
 * CodeTeller Toast（独立轻量实现）
 * - 不依赖额外库
 * - 支持 success/info/error/warning 类型
 */

const ICON_TEXT = {
	info: 'i',
	success: '✓',
	warning: '!',
	error: '×',
}

const TYPE_CLASSES = {
	info: 'border-info/30 text-info',
	success: 'border-success/30 text-success',
	warning: 'border-warning/30 text-warning',
	error: 'border-error/30 text-error',
}

let toastContainerEl = null
let defaultDurationMs = 4000

/**
 * 获取/创建 toast 容器元素。
 * @returns {HTMLDivElement} toast 容器。
 */
function ensureToastContainer() {
	if (toastContainerEl) return toastContainerEl

	toastContainerEl =
		document.getElementById('codeteller-toast-container') ||
		Object.assign(document.createElement('div'), {
			id: 'codeteller-toast-container',
			className: 'fixed right-4 bottom-4 z-[1000] flex flex-col gap-2 items-end pointer-events-none',
			'aria-live': 'polite',
			'aria-relevant': 'additions',
		})

	if (!toastContainerEl.isConnected) document.body.appendChild(toastContainerEl)

	return toastContainerEl
}

/**
 * 注入 toast 的关键帧样式（只注入一次）。
 * @returns {void}
 */
function ensureAnimationsStyle() {
	if (document.getElementById('codeteller-toast-style')) return
	const style = document.createElement('style')
	style.id = 'codeteller-toast-style'
	style.textContent = `
@keyframes codetellerToastIn {
  from { opacity: 0; transform: translateY(12px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes codetellerToastOut {
  from { opacity: 1; transform: translateY(0) scale(1); }
  to { opacity: 0; transform: translateY(8px) scale(0.98); }
}
.codetellerToastIn { animation: codetellerToastIn 180ms ease-out both; }
.codetellerToastOut { animation: codetellerToastOut 220ms ease-in both; }
`
	document.head.appendChild(style)
}

/**
 * 显示 toast
 * @param {{ type?: 'info'|'success'|'warning'|'error', message: string, durationMs?: number }} options toast 参数。
 * @returns {HTMLDivElement} 创建的 toast 元素。
 */
export function showToast({ type = 'info', message, durationMs = defaultDurationMs }) {
	ensureAnimationsStyle()
	const container = ensureToastContainer()

	const toastEl = document.createElement('div')
	toastEl.className =
		'pointer-events-auto w-[min(28rem,92vw)] flex items-start gap-3 rounded-box border bg-base-100/95 shadow-xl ' +
		`backdrop-blur ${TYPE_CLASSES[type] ?? TYPE_CLASSES.info} codetellerToastIn`
	toastEl.setAttribute('role', 'alert')

	const iconEl = document.createElement('div')
	iconEl.className = 'w-7 h-7 rounded-full flex items-center justify-center bg-base-200/60 border'
	iconEl.textContent = ICON_TEXT[type] || ICON_TEXT.info

	const contentEl = document.createElement('div')
	contentEl.className = 'flex-1 min-w-0'
	const messageEl = document.createElement('div')
	messageEl.className = 'text-sm leading-relaxed whitespace-pre-wrap break-words'
	messageEl.textContent = message || ''
	contentEl.appendChild(messageEl)

	const closeBtn = document.createElement('button')
	closeBtn.type = 'button'
	closeBtn.className = 'btn btn-ghost btn-xs -mt-1 -mr-1'
	closeBtn.textContent = '×'
	closeBtn.setAttribute('aria-label', 'Close toast')

	closeBtn.addEventListener('click', () => {
		clearTimeout(timer)
		toastEl.classList.remove('codetellerToastIn')
		toastEl.classList.add('codetellerToastOut')
		toastEl.addEventListener('animationend', () => toastEl.remove(), { once: true })
	})

	toastEl.append(iconEl, contentEl, closeBtn)
	container.appendChild(toastEl)

	let timer = undefined
	if (durationMs > 0)
		timer = setTimeout(() => {
			toastEl.classList.remove('codetellerToastIn')
			toastEl.classList.add('codetellerToastOut')
			toastEl.addEventListener('animationend', () => toastEl.remove(), { once: true })
		}, durationMs)


	// 悬停暂停计时（仅在有定时器时）
	toastEl.addEventListener('mouseenter', () => { if (timer) clearTimeout(timer) })

	return toastEl
}

/**
 * 设置 toast 的默认展示时长。
 * @param {number} ms 默认时长（毫秒）。
 * @returns {void}
 */
export function setDefaultToastDuration(ms) {
	defaultDurationMs = Number(ms) || 0
}

