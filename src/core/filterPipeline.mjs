/**
 * 过滤管道：基于条目集合构建 `.gitignore` / `.codetellerignore` 上下文并判定是否忽略
 */
import ignore from 'https://esm.sh/ignore'

import { decodeBytesToText, pathHasGitSegment, isSkippedByBinaryExt } from '../utils/utils.mjs'

/**
 * 原始条目
 * @typedef {{ path: string, bytes: Uint8Array }} RawEntry
 */

/**
 * 从路径中提取目录基路径（POSIX 风格）。
 * @param {string} filePath 条目路径（POSIX 风格）。
 * @returns {string} 目录基路径；若无则返回空字符串。
 */
function getDirectoryBasePath(filePath) {
	return filePath.includes('/')
		? filePath.slice(0, filePath.lastIndexOf('/'))
		: ''
}

/**
 * 从 ignore 规则条目构建忽略匹配上下文。
 * @param {RawEntry[]} entries 原始条目列表。
 * @param {string} suffix 要匹配的后缀（如 `.gitignore`）。
 * @returns {Array<{ basePath: string, ignoreMatcher: ReturnType<typeof ignore> }>} 忽略匹配上下文列表。
 */
function buildIgnoreContextsFromIgnoreEntries(entries, suffix) {
	const ignoreEntries = entries.filter(
		entry => entry.path.endsWith(suffix) && !pathHasGitSegment(entry.path),
	)
	ignoreEntries.sort((entryA, entryB) => entryA.path.localeCompare(entryB.path))

	const contexts = []
	for (const entry of ignoreEntries) {
		const decoded = decodeBytesToText(entry.bytes)
		if (decoded === null) continue
		const directoryPath = getDirectoryBasePath(entry.path)
		const ignoreMatcher = ignore()
		ignoreMatcher.add(decoded)
		contexts.push({ basePath: directoryPath, ignoreMatcher })
	}
	return contexts
}

/**
 * 构建规则上下文
 * @param {RawEntry[]} entries 原始条目
 * @returns {{
 *   gitignoreContexts: Array<{ basePath: string, ignoreMatcher: ReturnType<typeof ignore> }>,
 *   codetellerignoreContexts: Array<{ basePath: string, ignoreMatcher: ReturnType<typeof ignore> }>,
 *   codetellerorderRules: null,
 * }} 忽略规则上下文（gitignore / codetellerignore）。
 */
export function buildIgnoreContextsFromEntries(entries) {
	return {
		gitignoreContexts: buildIgnoreContextsFromIgnoreEntries(entries, '.gitignore'),
		codetellerignoreContexts: buildIgnoreContextsFromIgnoreEntries(entries, '.codetellerignore'),
		// 占位：排序逻辑在 `sorter.mjs` 里完成，这里只负责 ignore。
		codetellerorderRules: null,
	}
}

/**
 * 判定文件路径是否被 ignore 规则忽略
 * @param {string} filePath 规范化文件路径
 * @param {Array<{ basePath: string, ignoreMatcher: { ignores: (p: string) => boolean } }>} ignoreContexts 由 `buildIgnoreContextsFromEntries` 得到的上下文
 * @returns {boolean} 是否被任一规则忽略
 */
export function isFilePathIgnoredByIgnoreContexts(filePath, ignoreContexts) {
	let ignored = false
	for (const { basePath, ignoreMatcher } of ignoreContexts) {
		if (basePath && filePath !== basePath && !filePath.startsWith(`${basePath}/`)) continue
		const relativePath = basePath ? filePath.slice(basePath.length + 1) : filePath
		try {
			if (ignoreMatcher.ignores(relativePath)) {
				ignored = true
				break
			}
		} catch {
			/* 个别规则异常则保留文件 */
		}
	}
	return ignored
}

/**
 * 判定是否应跳过（被忽略或按扩展名视为二进制）
 * @param {RawEntry} entry 原始路径与字节
 * @param {Array<{ basePath: string, ignoreMatcher: { ignores: (p: string) => boolean } }>} ignoreContexts gitignore 上下文
 * @param {{
 *   gitignoreContexts: Array<{ basePath: string, ignoreMatcher: { ignores: (p: string) => boolean } }>,
 *   codetellerignoreContexts: Array<{ basePath: string, ignoreMatcher: { ignores: (p: string) => boolean } }>,
 * }} ruleContexts buildIgnoreContextsFromEntries 生成的上下文。
 * @returns {boolean} 是否应跳过（被忽略或按扩展名视为二进制）
 */
export function shouldSkipRawEntryInZipStylePipeline(entry, ruleContexts) {
	if (isFilePathIgnoredByIgnoreContexts(entry.path, ruleContexts.gitignoreContexts)) return true
	if (isFilePathIgnoredByIgnoreContexts(entry.path, ruleContexts.codetellerignoreContexts)) return true
	if (isSkippedByBinaryExt(entry.path)) return true
	return false
}
