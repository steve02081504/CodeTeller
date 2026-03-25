/**
 * 目录遍历共享工具（Worker/主线程复用）
 *
 * 目的：
 * - 复用 `.git` 段过滤与 `stripCommonRootPrefix`
 * - 复用 `.codetellerorder` 读取 -> 构建“作用域继承”规则映射
 * - 复用基于 scoped order 的排序
 */

import { buildOrderRuleMapFromFileEntries, sortPathRecordsByScopedOrder, sortFilesByScopedOrder } from '../core/sorter.mjs'
import { pathHasGitSegment, stripCommonRootPrefix } from '../utils/utils.mjs'

/**
 * 将原始条目预处理：去公共根前缀 + 过滤掉路径中包含 `.git` 的条目。
 * @template {{ path: string }} T
 * @param {T[]} entries 需要预处理的条目列表。
 * @returns {T[]} 处理后的条目列表。
 */
export function preprocessDirectoryEntries(entries) {
	const list = stripCommonRootPrefix(entries)
	return list.filter(entry => !pathHasGitSegment(entry.path))
}

/**
 * 将目录条目按 `.codetellerorder` 分区。
 * @template {{ path: string }} T
 * @param {T[]} entries 需要分区的条目列表。
 * @returns {{ orderRecords: T[], textRecords: T[] }} 分区结果（order / text）。
 */
export function partitionOrderRecords(entries) {
	const orderRecords = entries.filter(entry => entry.path.endsWith('.codetellerorder'))
	const textRecords = entries.filter(entry => !entry.path.endsWith('.codetellerorder'))
	return { orderRecords, textRecords }
}

/**
 * 读取 `.codetellerorder` 内容并构建作用域继承规则映射。
 * @template T
 * @param {T[]} orderRecords 需要读取 `.codetellerorder` 的记录列表。
 * @param {(record: T) => Promise<string>} readOrderContent 异步读取顺序文件内容的函数。
 * @returns {Map<string, string[]>} basePath -> glob 规则行（未前缀化）
 */
export async function buildScopedOrderRuleMapFromRecords(orderRecords, readOrderContent) {
	const fileEntries = []
	for (const orderRecord of orderRecords)
		try {
			const content = await readOrderContent(orderRecord)
			if (typeof content !== 'string') continue
			fileEntries.push({ path: orderRecord.path, content })
		} catch {
			/* 忽略不可读顺序文件 */
		}

	return buildOrderRuleMapFromFileEntries(fileEntries)
}

/**
 * 按作用域继承规则排序“非 `.codetellerorder`”路径记录。
 * @template {{ path: string }} T
 * @param {T[]} textRecords 需要排序的文本条目列表。
 * @param {Map<string, string[]>} orderRuleMap basePath -> glob rules
 * @returns {T[]} 排序后的文本条目列表。
 */
export function sortPathRecordsByScopedOrderForText(textRecords, orderRuleMap) {
	return sortPathRecordsByScopedOrder(textRecords, orderRuleMap)
}

/**
 * 供主线程 pipeline 复用：对最终 `FileEntry[]` 做 scoped order 排序。
 * @param {Array<{ path: string, content: string }>} fileEntries 需要排序的文件条目列表。
 * @returns {Array<{ path: string, content: string }>} 排序后的文件条目列表。
 */
export function sortFileEntriesByScopedOrder(fileEntries) {
	return sortFilesByScopedOrder(fileEntries)
}

