import { getLanguage, onLanguageChange, setLanguage } from '../i18n/uiI18n.mjs'

/**
 * 加载语言列表（来自 `src/i18n/locales/list.csv`）。
 * @returns {Promise<Array<{ lang: string, name: string }>>} 语言列表（lang->name）。
 */
async function loadLocaleList() {
	const url = new URL('../i18n/locales/list.csv', import.meta.url)
	const response = await fetch(url)
	if (!response.ok) throw new Error(`Failed to load locale list: ${response.status}`)
	const csvText = await response.text()
	const lines = csvText.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
	if (lines.length <= 1) return []

	return lines.slice(1).map(line => {
		const [lang, ...nameParts] = line.split(',')
		return {
			lang: (lang || '').trim(),
			name: nameParts.join(',').trim(),
		}
	}).filter(item => item.lang && item.name)
}

/**
 * 渲染语言选择下拉选项。
 * @returns {Promise<void>}
 */
async function renderLanguageOptions() {
	const langSelect = document.getElementById('lang-select')
	if (!langSelect) return
	try {
		const locales = await loadLocaleList()
		if (!locales.length) return
		langSelect.replaceChildren()
		for (const locale of locales) {
			const option = document.createElement('option')
			option.value = locale.lang
			option.textContent = locale.name
			langSelect.append(option)
		}
	} catch {
		// fallback: keep static options in index.html
	}
}

/**
 * 绑定语言下拉与 i18n 切换逻辑。
 * @returns {Promise<void>}
 */
export async function bindAppTranslations() {
	const langSelect = document.getElementById('lang-select')
	await renderLanguageOptions()
	if (langSelect) langSelect.value = getLanguage()

	if (langSelect)
		langSelect.addEventListener('change', () => {
			void setLanguage(langSelect.value)
		})


	onLanguageChange(() => {
		if (langSelect) langSelect.value = getLanguage()
	})
}

