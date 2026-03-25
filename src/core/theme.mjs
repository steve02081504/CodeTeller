import { STORAGE_KEYS } from './constants.mjs'

const THEME_MODE_KEY = STORAGE_KEYS.themeMode
const THEME_KEY = STORAGE_KEYS.theme

/**
 * 获取系统偏好主题
 * @returns {'dark' | 'light'} 系统偏好主题
 */
export function getPreferredTheme() {
	return window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ? 'dark' : 'light'
}

/**
 * 解析用户选择的主题模式
 * @returns {string} 用户选择的 auto/light/dark
 */
export function resolveThemeMode() {
	return localStorage.getItem(THEME_MODE_KEY) || 'auto'
}

/**
 * 从页面主题解析 Shiki 主题名
 * @param {string} theme 页面 `data-theme` 或 light/dark
 * @returns {string} Shiki 主题名
 */
export function shikiThemeFromPageTheme(theme) {
	return theme === 'light' ? 'github-light' : 'github-dark-dimmed'
}

/**
 * 获取与 `document.documentElement.dataset.theme` 同步的 Shiki 主题名
 * @returns {string} Shiki 主题名
 */
export function getShikiThemeForDocument() {
	// 如果页面主题为空，则默认使用 dark 主题
	const pageTheme = document.documentElement.dataset.theme || 'dark'
	return shikiThemeFromPageTheme(pageTheme)
}

/**
 * 应用主题模式
 * @param {string} mode auto / light / dark
 * @param {HTMLSelectElement | null} themeSelectEl 主题下拉框
 * @returns {void}
 */
export function applyThemeMode(mode, themeSelectEl) {
	const picked = mode || 'auto'
	localStorage.setItem(THEME_MODE_KEY, picked)
	if (picked === 'auto') {
		localStorage.removeItem(THEME_KEY)
		document.documentElement.dataset.theme = getPreferredTheme()
	} else {
		localStorage.setItem(THEME_KEY, picked)
		document.documentElement.dataset.theme = picked
	}
	if (themeSelectEl) themeSelectEl.value = picked
}

/**
 * 同步页面主题与用户偏好
 * @param {HTMLSelectElement | null} themeSelectEl 主题下拉框
 * @returns {void}
 */
export function syncPageThemeByPreference(themeSelectEl) {
	applyThemeMode(resolveThemeMode(), themeSelectEl)
}

/**
 * 绑定主题自动同步
 * @param {{ themeSelectEl: HTMLSelectElement | null, onThemeChange: () => void }} options 监听系统/跨页主题
 * @returns {void}
 */
export function bindThemeAutoSync({ themeSelectEl, onThemeChange }) {
	const media = window.matchMedia?.('(prefers-color-scheme: dark)')
	if (media)
		media.addEventListener('change', () => {
			if (resolveThemeMode() !== 'auto') return
			syncPageThemeByPreference(themeSelectEl)
			onThemeChange()
		})

	window.addEventListener('storage', e => {
		if (e.key !== THEME_MODE_KEY) return
		syncPageThemeByPreference(themeSelectEl)
		onThemeChange()
	})
}
