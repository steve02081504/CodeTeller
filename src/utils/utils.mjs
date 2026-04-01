import {
	BINARY_EXT,
	NON_PRINTABLE_RATIO_SKIP,
	UTF8_LOOSE_SAMPLE_MAX_CHARS,
	UTF8_PROBE_MAX_BYTES,
	UTF8_REPLACEMENT_RATIO_SKIP,
} from '../core/config.mjs'

const DEFAULT_IGNORED_PATH_SEGMENTS = new Set(['assets'])

/**
 * 文件条目
 * @typedef {{ path: string, content: string }} FileEntry
 */

/**
 * 获取文件扩展名
 * @param {string} path 文件路径
 * @returns {string} 小写扩展名，无点
 */
export function getFileExtension(path) {
	const base = path.split('/').pop() || ''
	const i = base.lastIndexOf('.')
	if (i <= 0) return ''
	return base.slice(i + 1).toLowerCase()
}

/**
 * 仅按扩展名快速跳过（不解码内容）
 * @param {string} path 文件路径
 * @returns {boolean} 是否跳过
 */
export function isSkippedByBinaryExt(path) {
	const e = getFileExtension(path)
	return !!(e && BINARY_EXT.has(e))
}

/**
 * stream.prepareSegments：仅扩展名快筛；点号文件由 traverse 的 gitignore 等规则处理
 * @param {string} path 文件路径
 * @returns {boolean} 是否跳过
 */
export function isSkippedPath(path) {
	if (/\.codetellerorder$/iu.test(path)) return true
	return isSkippedByBinaryExt(path)
}

/**
 * 路径任一段为 `.git` 则忽略（含 `.git` 目录下所有文件）
 * @param {string} path 文件路径
 * @returns {boolean} 是否包含 `.git` 段
 */
export function pathHasGitSegment(path) {
	return path.split('/').some(seg => seg === '.git')
}

/**
 * 路径命中默认忽略目录段（如 `assets`）则忽略
 * @param {string} path 文件路径
 * @returns {boolean} 是否命中默认忽略目录段
 */
export function pathHasDefaultIgnoredSegment(path) {
	return path.split('/').some(seg => DEFAULT_IGNORED_PATH_SEGMENTS.has(seg))
}

/**
 * 规范化路径
 * @param {string} filePath 路径字符串
 * @returns {string} 规范化后的 POSIX 风格路径
 */
export function normalizeSlashes(filePath) {
	return filePath.replace(/\\/g, '/').replace(/^\.\//, '')
}

/**
 * 若所有路径共享同一顶层目录，则去掉该前缀（保留 `bytes` / `content` 等其余字段）
 * @template {{ path: string }} T
 * @param {T[]} entries 带 path 的条目
 * @returns {T[]} 去掉公共根后的新数组
 */
export function stripCommonRootPrefix(entries) {
	if (entries.length === 0) return entries
	let pathSegments = entries.map(entry => entry.path.split('/').filter(Boolean))
	let prefix = ''
	while (true) {
		const minDepth = Math.min(...pathSegments.map(segments => segments.length))
		if (minDepth < 2) break
		const first = pathSegments[0][0]
		if (!pathSegments.every(segments => segments[0] === first)) break
		prefix += `${first}/`
		pathSegments = pathSegments.map(segments => segments.slice(1))
	}
	if (!prefix) return entries
	return entries.map(entry => ({
		...entry,
		path: entry.path.startsWith(prefix) ? entry.path.slice(prefix.length) : entry.path,
	}))
}

/**
 * 按路径排序
 * @template {{ path: string }} T
 * @param {T[]} entries 带 path 的条目
 * @returns {T[]} 按 path 排序后的新数组
 */
export function sortByPath(entries) {
	return [...entries].sort((a, b) => a.path.localeCompare(b.path))
}

/**
 * UTF-8 解码；明显无效或 NUL 过多则返回 null
 * @param {Uint8Array} uint8Array 原始字节
 * @returns {string|null} 文本或不可解码时为 null
 */
export function decodeBytesToText(uint8Array) {
	if (!uint8Array || uint8Array.length === 0) return ''
	let nullByteCount = 0
	const probeLength = Math.min(uint8Array.length, UTF8_PROBE_MAX_BYTES)
	for (let index = 0; index < probeLength; index++)
		if (uint8Array[index] === 0) nullByteCount++
	if (nullByteCount > 0) return null
	try {
		const decoder = new TextDecoder('utf-8', { fatal: true })
		return decoder.decode(uint8Array)
	} catch {
		try {
			const loose = new TextDecoder('utf-8', { fatal: false }).decode(uint8Array)
			const sampleLength = Math.min(loose.length, UTF8_LOOSE_SAMPLE_MAX_CHARS)
			if (sampleLength === 0) return loose
			let replacementCount = 0
			for (let index = 0; index < sampleLength; index++)
				if (loose[index] === '\uFFFD') replacementCount++
			if (replacementCount / sampleLength > UTF8_REPLACEMENT_RATIO_SKIP) return null
			return loose
		} catch {
			return null
		}
	}
}

/**
 * 并发控制池：以不超过 concurrencyLimit 的并发数对 items 执行 taskFn
 * @template T
 * @template R
 * @param {number} concurrencyLimit 最大并发数
 * @param {T[]} items 任务列表
 * @param {(item: T) => Promise<R>} taskFn 任务函数
 * @returns {Promise<R[]>} 所有任务结果（顺序与 items 一致）
 */
export async function runConcurrently(concurrencyLimit, items, taskFn) {
	const executing = new Set()
	const results = []
	for (const item of items) {
		const promise = Promise.resolve().then(() => taskFn(item))
		results.push(promise)
		executing.add(promise)
		/**
		 * 清理并从 executing 集合移除 promise。
		 * @returns {boolean} delete 的返回值。
		 */
		const cleanup = () => executing.delete(promise)
		promise.then(cleanup, cleanup)
		if (executing.size >= concurrencyLimit) await Promise.race(executing)
	}
	return Promise.all(results)
}

/**
 * 不可打印字符（Unicode 类别 C，且非 tab/LF/CR）占比超过阈值则视为二进制
 * @param {string} str 文本
 * @returns {boolean} 是否 Mostly 不可打印
 */
export function isMostlyNonPrintable(str) {
	if (str.length === 0) return false
	let nonPrintableCount = 0
	let totalCodePoints = 0
	for (let index = 0; index < str.length;) {
		const codePoint = str.codePointAt(index)
		index += codePoint > 0xFFFF ? 2 : 1
		totalCodePoints++
		if (codePoint === 0x09 || codePoint === 0x0A || codePoint === 0x0D) continue
		if (codePoint === 0xFFFD) nonPrintableCount++
		else if (/\p{C}/u.test(String.fromCodePoint(codePoint))) nonPrintableCount++
	}
	if (totalCodePoints === 0) return false
	return nonPrintableCount / totalCodePoints > NON_PRINTABLE_RATIO_SKIP
}

