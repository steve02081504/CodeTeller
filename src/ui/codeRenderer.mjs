import { createHighlighter } from 'https://esm.sh/shiki'

import { LIMITS } from '../core/config.mjs'
import { getShikiThemeForDocument } from '../core/theme.mjs'

const MAX_FULL_RENDER_CHARS = LIMITS.maxFullRenderChars
const CURSOR_RENDER_CONTEXT = LIMITS.cursorRenderContext
const MAX_HIGHLIGHT_CHARS = LIMITS.maxHighlightChars
const HIGHLIGHT_MARKER = '\uE000'

/**
 * 创建代码渲染器
 * @param {{ codeElement: HTMLElement }} options 代码容器
 * @returns {{ renderEditorWithCursor: (snapshot: { text: string, cursorIndex: number, path: string, lang: string }) => void }} 渲染器 API
 */
export function createCodeRenderer({ codeElement }) {
	let highlighterPromise = null
	let resolvedHighlighter = null
	const loadedLangs = new Set()
	const failedLangs = new Set()
	/** 每次渲染递增，异步高亮完成时比对，避免旧任务覆盖新画面 */
	let renderGeneration = 0
	let lastRenderPath = ''
	let lastRenderLeft = ''
	let lastRenderRight = ''
	// 双重校验：避免“旧任务+新 DOM”组合导致的细微错乱
	let lastRequestedPath = ''
	let lastRequestedLang = ''
	let lastRequestedSafeIdx = -1

	/**
	 * 获取 Shiki 高亮器
	 * @returns {Promise<*>} Shiki 高亮器或初始化失败时为 null
	 */
	function getHighlighter() {
		if (!highlighterPromise)
			highlighterPromise = createHighlighter({
				themes: ['github-dark-dimmed', 'github-light'],
				langs: ['text'],
			})
				.then(h => {
					resolvedHighlighter = h
					loadedLangs.add('text')
					return h
				})
				.catch(error => {
					console.warn('Shiki 初始化失败，回退普通渲染', error)
					return null
				})

		return highlighterPromise
	}

	/**
	 * 确保 Shiki 语言已加载
	 * @param {string} lang Shiki 语言 id
	 * @returns {void}
	 */
	function ensureLangLoaded(lang) {
		if (!resolvedHighlighter || loadedLangs.has(lang) || failedLangs.has(lang)) return
		try {
			resolvedHighlighter
				.loadLanguage(lang)
				.then(() => loadedLangs.add(lang))
				.catch(error => {
					console.warn(`Shiki 异步加载语言 [${lang}] 失败:`, error)
					failedLangs.add(lang)
				})
		} catch (error) {
			// Shiki 在某些“未注册语言 id”场景下可能同步抛错，必须 try/catch 捕获
			console.warn(`Shiki 不支持的语言 [${lang}]:`, error)
			failedLangs.add(lang)
		}
	}

	/**
	 * 尝试同步高亮文本
	 * @param {string} text 全文
	 * @param {number} cursorIndex 光标位置
	 * @param {string} lang Shiki 语言
	 * @returns {string|null} 代码区内部 HTML 或 null
	 */
	function tryHighlightSync(text, cursorIndex, lang) {
		if (!resolvedHighlighter) return null
		if (failedLangs.has(lang)) lang = 'text'
		if (!loadedLangs.has(lang)) {
			ensureLangLoaded(lang)
			return null
		}
		const useLang = loadedLangs.has(lang) ? lang : 'text'
		const markedText = text.slice(0, cursorIndex) + HIGHLIGHT_MARKER + text.slice(cursorIndex)
		const raw = resolvedHighlighter.codeToHtml(markedText, {
			lang: useLang,
			theme: getShikiThemeForDocument(),
		})
		const inner = extractCodeInnerHtml(raw)
		return inner ? decorateMarkerAsCursor(inner) : null
	}

	/**
	 * 判断是否尝试 Shiki 高亮
	 * @param {string} text 全文
	 * @returns {boolean} 是否尝试 Shiki 高亮
	 */
	function shouldHighlightText(text) {
		return text.length > 0 && text.length <= MAX_HIGHLIGHT_CHARS
	}

	/**
	 * 提取 Shiki 输出 HTML 中的 `<code>` 内层 HTML
	 * Shiki 输出结构稳定，直接正则提取比 DOMParser 快得多
	 * @param {string} shikiHtml Shiki 输出 HTML
	 * @returns {string|null} `<code>` 内层 HTML
	 */
	function extractCodeInnerHtml(shikiHtml) {
		const match = shikiHtml.match(/<code[^>]*>([\s\S]*?)<\/code>/i)
		return match ? match[1] : null
	}

	/**
	 * 将标记符替换为光标 span
	 * @param {string} html 片段 HTML
	 * @returns {string} 插入光标 span 后的 HTML
	 */
	function decorateMarkerAsCursor(html) {
		return html
			.replace(HIGHLIGHT_MARKER, '<span class="editor-cursor"></span>')
			.replace('&#xE000;', '<span class="editor-cursor"></span>')
			.replace('&#57344;', '<span class="editor-cursor"></span>')
			.replace('&#xe000;', '<span class="editor-cursor"></span>')
	}

	/**
	 * 获取可能截断后的文本与光标
	 * @param {string} text 全文
	 * @param {number} cursorIndex 光标位置
	 * @returns {{ text: string, cursorIndex: number }} 可能截断后的文本与光标
	 */
	function getRenderableText(text, cursorIndex) {
		const safeCursor = Math.max(0, Math.min(cursorIndex, text.length))
		if (text.length <= MAX_FULL_RENDER_CHARS)
			return { text, cursorIndex: safeCursor }

		const start = Math.max(0, safeCursor - CURSOR_RENDER_CONTEXT)
		const end = Math.min(text.length, safeCursor + CURSOR_RENDER_CONTEXT)
		const leftOmitted = start > 0 ? '/* …前文省略… */\n' : ''
		const rightOmitted = end < text.length ? '\n/* …后文省略… */' : ''
		const sliced = leftOmitted + text.slice(start, end) + rightOmitted
		const shiftedCursor = leftOmitted.length + (safeCursor - start)
		return { text: sliced, cursorIndex: shiftedCursor }
	}

	/**
	 * 渲染普通文本并插入光标
	 * @param {string} path 当前文件路径
	 * @param {string} text 全文
	 * @param {number} cursorIndex 光标位置
	 * @returns {void}
	 */
	function renderPlainWithCursor(path, text, cursorIndex) {
		const leftText = text.slice(0, cursorIndex)
		const rightText = text.slice(cursorIndex)
		const canAppendPrefix =
			path === lastRenderPath
			&& rightText === lastRenderRight
			&& leftText.startsWith(lastRenderLeft)
			&& codeElement.childNodes.length === 3
			&& codeElement.childNodes[0].nodeType === Node.TEXT_NODE
			&& codeElement.childNodes[2].nodeType === Node.TEXT_NODE

		if (canAppendPrefix)
			codeElement.childNodes[0].textContent += leftText.slice(lastRenderLeft.length)
		else {
			const leftNode = document.createTextNode(leftText)
			const cursorNode = document.createElement('span')
			cursorNode.className = 'editor-cursor'
			const rightNode = document.createTextNode(rightText)
			codeElement.replaceChildren(leftNode, cursorNode, rightNode)
		}

		lastRenderPath = path
		lastRenderLeft = leftText
		lastRenderRight = rightText
	}

	/**
	 * 滚动光标到视图中
	 * @returns {void}
	 */
	function scrollCursorIntoView() {
		codeElement.querySelector('.editor-cursor')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
	}

	/**
	 * 应用高亮 HTML
	 * @param {string} html 高亮 HTML
	 * @returns {void}
	 */
	function applyHighlightedHtml(html) {
		codeElement.innerHTML = html
		scrollCursorIntoView()
	}

	/**
	 * 渲染编辑器并插入光标
	 * @param {{ text: string, cursorIndex: number, path: string, lang: string }} snapshot 编辑器快照
	 * @returns {void}
	 */
	function renderEditorWithCursor(snapshot) {
		const gen = ++renderGeneration
		const { text, cursorIndex, path, lang } = snapshot
		const renderable = getRenderableText(text, cursorIndex)
		const safeIdx = Math.max(0, Math.min(renderable.cursorIndex, renderable.text.length))
		lastRequestedPath = path
		lastRequestedLang = lang
		lastRequestedSafeIdx = safeIdx

		if (shouldHighlightText(renderable.text)) {
			const syncHtml = tryHighlightSync(renderable.text, safeIdx, lang)
			if (syncHtml) {
				if (gen !== renderGeneration) return
				if (
					path !== lastRequestedPath
					|| lang !== lastRequestedLang
					|| safeIdx !== lastRequestedSafeIdx
				)
					return
				applyHighlightedHtml(syncHtml)
				return
			}
			renderPlainWithCursor(path, renderable.text, safeIdx)
			scrollCursorIntoView()
			getHighlighter().then(() => {
				if (gen !== renderGeneration) return
				if (
					path !== lastRequestedPath
					|| lang !== lastRequestedLang
					|| safeIdx !== lastRequestedSafeIdx
				)
					return
				const html = tryHighlightSync(renderable.text, safeIdx, lang)
				if (!html || gen !== renderGeneration) return
				applyHighlightedHtml(html)
			})
			return
		}

		renderPlainWithCursor(path, renderable.text, safeIdx)
		scrollCursorIntoView()
	}

	return { renderEditorWithCursor }
}
