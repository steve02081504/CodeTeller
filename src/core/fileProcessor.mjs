/**
 * 统一的文件内容解码/过滤逻辑（用于 pipeline 与 Worker 复用）
 */
import { decodeBytesToText, isMostlyNonPrintable, isSkippedByBinaryExt } from '../utils/utils.mjs'

/**
 * 验证文件内容是否可展示，如果不可展示则返回 null
 * @param {Uint8Array} bytes 原始字节内容
 * @param {string} path POSIX 路径（用于二进制扩展名快速跳过）
 * @returns {string|null} 可展示文本；不可展示则为 null
 */
export function validateFileContent(bytes, path) {
	if (isSkippedByBinaryExt(path)) return null

	const text = decodeBytesToText(bytes)
	if (text === null) return null
	if (isMostlyNonPrintable(text)) return null
	return text
}

