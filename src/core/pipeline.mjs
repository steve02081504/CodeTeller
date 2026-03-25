/**
 * 原始字节条目 → 文本 FileEntry：统一去前缀、.git 过滤、gitignore、解码与排序（单一路径，避免与 stream 重复处理）
 */

import { sortFileEntriesByScopedOrder, preprocessDirectoryEntries } from '../shared/DirectoryTraverser.mjs'

import { validateFileContent } from './fileProcessor.mjs'
import {
	buildIgnoreContextsFromEntries,
	shouldSkipRawEntryInZipStylePipeline,
} from './filterPipeline.mjs'

/**
 * 原始条目
 * @typedef {{ path: string, bytes: Uint8Array }} RawEntry
 */

/**
 * 最终化原始条目
 * @param {RawEntry[]} rawEntries 原始路径与字节
 * @returns {import('../utils/utils.mjs').FileEntry[]} 解码、过滤并按规则排序后的文本条目
 */
export function finalizeRawEntries(rawEntries) {
	if (rawEntries.length === 0) return []
	const list = preprocessDirectoryEntries(rawEntries)

	const ignoreContexts = buildIgnoreContextsFromEntries(list)

	const output = []
	for (const entry of list) {
		if (shouldSkipRawEntryInZipStylePipeline(entry, ignoreContexts)) continue

		const text = validateFileContent(entry.bytes, entry.path)
		if (text === null) continue
		output.push({ path: entry.path, content: text })
	}
	return sortFileEntriesByScopedOrder(output)
}
