/**
 * 本地目录遍历：.gitignore / 二进制扩展名等规则与主线程、Worker 共用
 */
import ignore from 'https://esm.sh/ignore'

import { LIMITS } from '../core/config.mjs'
import {
	normalizeSlashes,
	isSkippedByBinaryExt,
} from '../utils/utils.mjs'

/**
 * 判断路径是否被忽略
 * @param {string} entryPath 条目完整路径
 * @param {boolean} isDirectory 是否为目录
 * @param {Array<{
 *   basePath: string,
 *   rules: {
 *     gitignoreMatcher: ReturnType<typeof ignore> | null,
 *     codetellerignoreMatcher: ReturnType<typeof ignore> | null,
 *     codetellerorderRules: string[] | null,
 *   }
 * }>} activeRuleStack 自根目录继承的规则栈
 * @returns {boolean} 是否被任一规则忽略
 */
function isPathIgnored(entryPath, isDirectory, activeRuleStack) {
	for (const { basePath, rules } of activeRuleStack) {
		const relativePath = basePath ? entryPath.slice(basePath.length + 1) : entryPath
		const pathForIgnoreCheck = isDirectory ? `${relativePath}/` : relativePath
		try {
			if (rules.gitignoreMatcher?.ignores(pathForIgnoreCheck)) return true
		} catch {
			/* 兼容异常规则 */
		}
		try {
			if (rules.codetellerignoreMatcher?.ignores(pathForIgnoreCheck)) return true
		} catch {
			/* 兼容异常规则 */
		}
	}
	return false
}

/**
 * 文本文件句柄记录
 * @typedef {{ path: string, handle: FileSystemFileHandle }} LocalTextFileHandleRecord
 * 路径与原始字节条目
 * @typedef {{ path: string, bytes: Uint8Array }} RawEntry
 */

/**
 * 遍历文本文件句柄记录
 * @param {FileSystemDirectoryHandle} root 当前遍历的目录句柄
 * @param {string} pathPrefix 相对根的路径前缀（POSIX）
 * @param {Array<{
 *   basePath: string,
 *   rules: {
 *     gitignoreMatcher: ReturnType<typeof ignore> | null,
 *     codetellerignoreMatcher: ReturnType<typeof ignore> | null,
 *     codetellerorderRules: string[] | null,
 *   }
 * }>} parentRuleStack 父级继承的规则栈
 * @returns {AsyncGenerator<LocalTextFileHandleRecord, void, unknown>} 文本文件句柄记录异步迭代器
 */
async function* iterateTextFileHandleRecords(root, pathPrefix = '', parentRuleStack = []) {
	let gitignoreMatcher = null
	let codetellerignoreMatcher = null

	try {
		const gitignoreHandle = await root.getFileHandle('.gitignore')
		const gitignoreFile = await gitignoreHandle.getFile()
		const gitignoreText = await gitignoreFile.text()
		gitignoreMatcher = ignore().add(gitignoreText)
	} catch {
		/* 无 .gitignore */
	}

	try {
		const codetellerignoreHandle = await root.getFileHandle('.codetellerignore')
		const codetellerignoreFile = await codetellerignoreHandle.getFile()
		const codetellerignoreText = await codetellerignoreFile.text()
		codetellerignoreMatcher = ignore().add(codetellerignoreText)
	} catch {
		/* 无 .codetellerignore */
	}

	const activeRuleStack = [...parentRuleStack]
	if (gitignoreMatcher || codetellerignoreMatcher)
		activeRuleStack.push({
			basePath: pathPrefix,
			rules: {
				gitignoreMatcher,
				codetellerignoreMatcher,
				// 这里不在 worker 的遍历阶段解析 `.codetellerorder`
				codetellerorderRules: null,
			},
		})

	try {
		for await (const [entryName, handle] of root.entries()) {
			if (handle.kind === 'directory' && entryName === '.git') continue

			const entryPath = pathPrefix ? `${pathPrefix}/${entryName}` : entryName
			const isDirectory = handle.kind === 'directory'

			if (isPathIgnored(entryPath, isDirectory, activeRuleStack)) continue

			if (isDirectory)
				yield* iterateTextFileHandleRecords(handle, entryPath, activeRuleStack)
			else {
				if (isSkippedByBinaryExt(entryPath)) continue
				const file = await handle.getFile()
				if (file.size > LIMITS.maxFileChars * 4) continue
				if (file.size === 0) continue
				yield {
					path: normalizeSlashes(entryPath),
					handle,
				}
			}
		}
	} catch (error) {
		const label = pathPrefix || root.name || '(root)'
		console.warn(`[Skip] 无法遍历目录: ${label}`, error)
	}
}

/**
 * 枚举文本文件句柄
 * @param {FileSystemDirectoryHandle} root 根目录句柄
 * @param {string} [pathPrefix] 相对根的路径前缀
 * @param {Array<{ basePath: string, ignoreMatcher: ReturnType<typeof ignore> }>} [parentIgnoreStack] 父级 ignore 栈
 * @returns {Promise<LocalTextFileHandleRecord[]>} 枚举到的文本文件句柄列表
 */
export async function enumerateTextFileHandles(root, pathPrefix = '', parentIgnoreStack = []) {
	const output = []
	for await (const record of iterateTextFileHandleRecords(root, pathPrefix, parentIgnoreStack))
		output.push(record)
	return output
}

/**
 * 遍历本地文件夹句柄
 * @param {FileSystemDirectoryHandle} root 根目录句柄
 * @param {string} [pathPrefix] 相对根的路径前缀
 * @param {Array<{ basePath: string, ignoreMatcher: ReturnType<typeof ignore> }>} [parentIgnoreStack] 父级 ignore 栈
 * @returns {Promise<RawEntry[]>} 路径与原始字节的条目列表
 */
export async function walkFolderHandle(root, pathPrefix = '', parentIgnoreStack = []) {
	const output = []
	for await (const { path, handle } of iterateTextFileHandleRecords(root, pathPrefix, parentIgnoreStack)) {
		const file = await handle.getFile()
		const buffer = new Uint8Array(await file.arrayBuffer())
		if (buffer.length === 0) continue
		output.push({ path, bytes: buffer })
	}
	return output
}
