/**
 * CodeTeller UI i18n（中/英/日）
 * 说明：
 * - 不改控制台输出，只翻译 UI 展示内容。
 * - 服务端/Worker 抛出的错误用 I18nError 携带 key + params，toastUi 负责翻译显示。
 */

/**
 * 用于 UI 翻译的错误对象
 */
export class I18nError extends Error {
	/**
	 * 创建用于 UI 翻译的错误对象。
	 * @param {string} i18nKey i18n key。
	 * @param {Record<string, any>} [params] 用于插值的参数。
	 * @param {string} [fallbackMessage] 未命中时的回退消息。
	 */
	constructor(i18nKey, params = {}, fallbackMessage = i18nKey) {
		super(fallbackMessage)
		/** @type {string} */
		this.i18nKey = i18nKey
		/** @type {Record<string, any>} */
		this.i18nParams = params || {}
		// 让 instanceof 在部分打包/跨 realm 场景下更稳定
		this.name = 'I18nError'
	}
}

const STORAGE_KEY = 'codeteller_ui_lang'
const langOptions = ['zh', 'en', 'ja']
const DEFAULT_LANG = 'en'
let currentTranslations = {}
let i18nObserver = null

/**
 * 尝试读取 localStorage。
 * @param {string} key 要读取的 key。
 * @returns {string|null} 读取到的值；失败则为 null。
 */
function safeGetLocalStorage(key) {
	try { return localStorage.getItem(key) } catch { return null }
}

/**
 * 尝试写入 localStorage。
 * @param {string} key 要写入的 key。
 * @param {string} value 要写入的值。
 * @returns {void}
 */
function safeSetLocalStorage(key, value) {
	try { localStorage.setItem(key, value) } catch { /* ignore */ }
}

/**
 * 根据浏览器信息推断初始语言。
 * @returns {string} 初始化语言代码。
 */
function detectInitialLang() {
	const stored = safeGetLocalStorage(STORAGE_KEY)
	return getBestLocale([
		stored,
		navigator?.language,
		...navigator?.languages || [],
		DEFAULT_LANG,
	].filter(Boolean))
}

let currentLang = detectInitialLang()
const languageChangeCallbacks = new Set()
const elementLocalizeLogicMap = new Map()

/**
 * 在候选语言列表里选择最合适的语言。
 * @param {Array<string>|null|undefined} preferredLocaleList 用户偏好语言列表。
 * @param {string[]} [localeList=langOptions] 可用语言列表。
 * @returns {string} 最佳匹配的语言代码。
 */
function getBestLocale(preferredLocaleList, localeList = langOptions) {
	const available = new Set(localeList.filter(Boolean))
	for (const preferredRaw of preferredLocaleList || []) {
		const preferred = String(preferredRaw || '').trim().toLowerCase()
		if (!preferred) continue

		if (available.has(preferred)) return preferred

		const prefix = preferred.split('-')[0]
		for (const locale of available)
			if (locale.toLowerCase().startsWith(prefix))
				return locale
	}
	return DEFAULT_LANG
}

/**
 * 加载指定语言的翻译包。
 * @param {string} lang 语言代码（如 `zh`/`en`/`ja`）。
 * @returns {Promise<Record<string, any>>} 翻译字典。
 */
async function loadLanguagePack(lang) {
	if (!langOptions.includes(lang)) return {}
	const url = new URL(`./locales/${lang}.json`, import.meta.url)
	try {
		const response = await fetch(url)
		if (!response.ok) throw new Error(`Failed to load language pack: ${lang}`)
		const data = await response.json()
		currentTranslations = data || {}
	} catch {
		currentTranslations = {}
	}
	return currentTranslations
}

// 确保初始语言也会写入 <html lang="">
document.documentElement.lang =
	currentLang === 'zh' ? 'zh-Hans' :
		currentLang === 'ja' ? 'ja' : 'en'

/**
 * 用 `{{key}}` 占位符对字符串进行插值。
 * @param {string} template 原始模板字符串。
 * @param {Record<string, any>} params 插值参数。
 * @returns {string} 插值后的字符串。
 */
function interpolate(template, params) {
	if (!template || !template.includes?.('{{')) return template
	return template.replace(/\{\{(\w+)\}\}/g, (_, key) => params?.[key] ?? '')
}

/**
 * 从嵌套对象中读取路径值（`.` 分隔）。
 * @param {any} obj 源对象。
 * @param {string} key 嵌套路径。
 * @returns {any} 解析得到的值；不存在则为 undefined。
 */
function getNestedValue(obj, key) {
	if (!obj || !key) return undefined
	const keys = String(key).split('.')
	let value = obj
	for (const k of keys)
		if (value && (typeof value === 'object') && (k in value)) value = value[k]
		else return undefined

	return value
}

/**
 * 获取当前语言代码。
 * @returns {string} 当前语言代码。
 */
export function getLanguage() {
	return currentLang
}

/**
 * 切换当前语言并将翻译应用到 DOM。
 * @param {string} lang 目标语言代码。
 * @returns {Promise<void>}
 */
export async function setLanguage(lang) {
	if (!langOptions.includes(lang)) return
	if (currentLang === lang) return
	await loadLanguagePack(lang)
	currentLang = lang
	safeSetLocalStorage(STORAGE_KEY, lang)

	// 更新 <html lang="">
	document.documentElement.lang =
		lang === 'zh' ? 'zh-Hans' :
			lang === 'ja' ? 'ja' : 'en'

	applyTranslationsToDom()
	runLanguageChangeCallbacks()
}

/**
 * 注册语言变化回调。
 * @param {(lang: string) => void} cb 当语言变化时触发的回调。
 * @returns {() => boolean} 取消订阅函数。
 */
export function onLanguageChange(cb) {
	languageChangeCallbacks.add(cb)
	return () => languageChangeCallbacks.delete(cb)
}

/**
 * 触发所有语言变化回调。
 * @returns {void}
 */
function runLanguageChangeCallbacks() {
	for (const cb of languageChangeCallbacks)
		try { cb(currentLang) } catch { /* ignore */ }

}

/**
 * 翻译 i18n key，并尝试从对象结构中读取指定字段。
 * @param {string} i18nKey i18n key。
 * @param {Record<string, any>} [params={}] 插值参数。
 * @param {string} [attr='textContent'] 优先读取的字段名。
 * @returns {string} 翻译结果；找不到则返回 i18nKey。
 */
export function translate(i18nKey, params = {}, attr = 'textContent') {
	const raw = getNestedValue(currentTranslations, i18nKey)
	if (raw === undefined || raw === null) return i18nKey
	if (typeof raw === 'string') return interpolate(raw, params)
	if (Array.isArray(raw)) return interpolate(String(raw[0] ?? i18nKey), params)
	if (typeof raw === 'object') {
		const picked = raw[attr] ?? raw.textContent ?? raw.value ?? raw.placeholder
		if (typeof picked === 'string') return interpolate(picked, params)
	}
	return i18nKey
}

/**
 * 尝试翻译，但找不到时返回 undefined（不报警）。
 * @param {string} i18nKey i18n key。
 * @param {Record<string, any>} [params={}] 插值参数。
 * @param {string} [attr='textContent'] 优先读取的字段名。
 * @returns {string|undefined} 翻译结果；找不到则为 undefined。
 */
function translateNowarn(i18nKey, params = {}, attr = 'textContent') {
	const raw = getNestedValue(currentTranslations, i18nKey)
	if (raw === undefined || raw === null) return undefined
	if (typeof raw === 'string') return interpolate(raw, params)
	if (Array.isArray(raw)) return interpolate(String(raw[0] ?? ''), params)
	if (typeof raw === 'object') {
		const picked = raw[attr] ?? raw.textContent ?? raw.value ?? raw.placeholder
		if (typeof picked === 'string') return interpolate(picked, params)
	}
	return undefined
}

/**
 * 仅在需要时更新 DOM 的属性值（避免重复写入）。
 * @param {HTMLElement} element 目标元素。
 * @param {string} propertyName 需要设置的 DOM 属性名（如 `textContent`）。
 * @param {string} value 新值。
 * @returns {boolean} 是否发生了更新。
 */
function updateElementPropertyIfNeeded(element, propertyName, value) {
	if (element[propertyName] === value) return false
	element[propertyName] = value
	return true
}

/**
 * 仅在需要时更新 DOM 的 attribute 值（避免重复写入）。
 * @param {HTMLElement} element 目标元素。
 * @param {string} attributeName 需要设置的 attribute 名。
 * @param {string} value 新值。
 * @returns {boolean} 是否发生了更新。
 */
function updateElementAttributeIfNeeded(element, attributeName, value) {
	if (element.getAttribute(attributeName) === value) return false
	element.setAttribute(attributeName, value)
	return true
}

/**
 * 根据 `data-i18n` 指令翻译并更新单个元素。
 * @param {HTMLElement} element 目标元素。
 * @returns {boolean} 是否发生了更新。
 */
function translateSingleElement(element) {
	const i18nConfig = element.dataset.i18n
	if (!i18nConfig) return false
	let updated = false
	const keys = i18nConfig.split(';').map(key => key.trim()).filter(Boolean)

	for (const key of keys) {
		if (key.startsWith('\'') && key.endsWith('\'')) {
			const literal = key.slice(1, -1)
			updated = updateElementPropertyIfNeeded(element, 'textContent', literal) || updated
			if (updated) break
			continue
		}

		const nestedRaw = getNestedValue(currentTranslations, key)
		if (!Array.isArray(nestedRaw) && nestedRaw && typeof nestedRaw === 'object') {
			const attrNames = ['placeholder', 'title', 'label', 'value', 'alt', 'aria-label']
			for (const attrName of attrNames) {
				const localizedValue = translateNowarn(`${key}.${attrName}`, element.dataset, attrName)
				if (localizedValue !== undefined)
					updated = updateElementAttributeIfNeeded(element, attrName, localizedValue) || updated
			}

			const propertyNames = ['textContent', 'innerHTML']
			for (const propertyName of propertyNames) {
				const localizedValue = translateNowarn(`${key}.${propertyName}`, element.dataset, propertyName)
				if (localizedValue !== undefined)
					updated = updateElementPropertyIfNeeded(element, propertyName, localizedValue) || updated
			}
			if (updated) break
			continue
		}

		const localizedText = translateNowarn(key, element.dataset, 'text')
		if (localizedText !== undefined) {
			updated = updateElementPropertyIfNeeded(element, 'innerHTML', localizedText) || updated
			if (updated) break
		}
	}
	return updated
}

/**
 * 翻译并本地化指定根节点内的元素。
 * @param {HTMLElement|null|undefined} rootElement 根节点。
 * @returns {HTMLElement|null|undefined} 同一个根节点引用。
 */
export function localizeElement(rootElement) {
	if (!rootElement) return rootElement
	if (rootElement.matches?.('[data-i18n]')) translateSingleElement(rootElement)
	for (const element of rootElement.querySelectorAll?.('[data-i18n]') || [])
		translateSingleElement(element)
	return rootElement
}

/**
 * 将当前语言应用到整个文档 DOM。
 * @returns {void}
 */
function applyTranslationsToDom() {
	if (!document?.body) return
	localizeElement(document.body)
	for (const logic of elementLocalizeLogicMap.values())
		try { logic(currentLang) } catch { /* ignore */ }

}

/**
 * 初始化并确保 observer 在 DOM 可用后运行。
 * @returns {void}
 */
function setupI18nObserver() {
	if (i18nObserver || !document?.body) return
	i18nObserver = new MutationObserver(mutationList => {
		for (const mutation of mutationList)
			if (mutation.type === 'childList') {
				for (const node of mutation.addedNodes)
					if (node.nodeType === Node.ELEMENT_NODE)
						localizeElement(/** @type {Element} */node)
			} else if (mutation.type === 'attributes' && mutation.attributeName === 'data-i18n')
				translateSingleElement(/** @type {HTMLElement} */mutation.target)


	})
	i18nObserver.observe(document.body, {
		attributes: true,
		attributeFilter: ['data-i18n'],
		childList: true,
		subtree: true,
	})
}

/**
 * 为特定元素注册自定义本地化逻辑，并返回清理函数。
 * @param {HTMLElement} element 目标元素。
 * @param {(lang: string) => void} logic 本地化逻辑。
 * @returns {() => boolean} 清理函数（停止对该元素的逻辑）。
 */
export function setElementLocalizeLogic(element, logic) {
	if (!element || typeof logic !== 'function') return () => { }
	elementLocalizeLogicMap.set(element, logic)
	try { logic(currentLang) } catch { /* ignore */ }
	/**
	 * 清理已注册的元素逻辑。
	 * @returns {boolean} 是否成功删除。
	 */
	const cleanup = () => elementLocalizeLogicMap.delete(element)
	if (element.isConnected) {
		const removeObserver = new MutationObserver(() => {
			if (!element.isConnected) {
				cleanup()
				removeObserver.disconnect()
			}
		})
		removeObserver.observe(document.body, { childList: true, subtree: true })
	}
	return cleanup
}

/**
 * 在 DOM ready 后确保 observer 已初始化。
 * @returns {void}
 */
function ensureObserverWhenReady() {
	if (document.body) {
		setupI18nObserver()
		return
	}
	window.addEventListener('DOMContentLoaded', () => setupI18nObserver(), { once: true })
}

/**
 * 根据 I18nError 或普通 Error，生成用于 toast 的最终文案。
 * @param {unknown} error 待格式化的错误对象。
 * @returns {string} toast 显示的最终文案。
 */
export function formatErrorForToast(error) {
	if (error instanceof I18nError || error?.i18nKey) {
		const i18nKey = error.i18nKey
		const params = error.i18nParams || {}
		return translate(i18nKey, params)
	}
	return String(error?.message || error || '')
}

/**
 * 初始化 i18n（加载翻译、应用到 DOM，并启动 observer）。
 * @returns {Promise<void>}
 */
export async function initI18n() {
	await loadLanguagePack(currentLang)
	applyTranslationsToDom()
	ensureObserverWhenReady()
}

