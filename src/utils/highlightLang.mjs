import languageMap from 'https://esm.sh/lang-map'

import { getFileExtension } from './utils.mjs'

const SHIKI_LANG_ALIASES = {
	plaintext: 'text',
}

/**
 * 规范化语言名
 * @param {string} lang 语言名或别名
 * @returns {string} Shiki 可用的语言 id
 */
function normalizeToShikiLangName(lang) {
	if (!lang) return 'text'
	const normalized = String(lang).toLowerCase().replace(/[^a-z0-9]+/g, '')
	return SHIKI_LANG_ALIASES[normalized] || normalized || 'text'
}

/**
 * 从扩展名获取 Shiki 语言 id
 * @param {string} extension 不带点的扩展名
 * @returns {string} Shiki 语言 id
 */
function shikiLangFromExtension(extension) {
	if (!extension) return 'text'
	let mapped = ''
	try {
		if (typeof languageMap.byExtension === 'function')
			mapped =
				languageMap.byExtension(extension) || languageMap.byExtension(`.${extension}`) || ''
	} catch {
		mapped = ''
	}
	return normalizeToShikiLangName(mapped || extension)
}

/**
 * 获取文件的高亮元数据
 * @param {string} path 文件路径
 * @returns {{ extension: string, shikiLang: string }} 扩展名与 Shiki 语言
 */
export function highlightMetaForPath(path) {
	const extension = getFileExtension(path)
	return { extension, shikiLang: shikiLangFromExtension(extension) }
}
