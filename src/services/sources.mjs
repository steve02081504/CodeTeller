import { translate } from '../i18n/uiI18n.mjs'

import { walkZipBuffer, walkFolderHandle, finalizeRawEntries } from './traverse.mjs'

/**
 * 在主线程一次性读取已选目录（无 Worker 时的回退）
 * @param {FileSystemDirectoryHandle} root 用户选择的根目录句柄
 * @returns {Promise<FileEntry[]>} 解析后的文本文件条目列表
 */
export async function entriesFromDirectoryHandle(root) {
	const raw = await walkFolderHandle(root)
	return finalizeRawEntries(raw)
}

/**
 * 文件条目
 * @typedef {{ path: string, content: string }} FileEntry
 */

/**
 * 从 ZIP 原始字节解析文件条目
 * @param {ArrayBuffer} buffer ZIP 原始字节
 * @returns {FileEntry[]} 解析后的文件条目
 */
export function entriesFromZipBuffer(buffer) {
	return finalizeRawEntries(walkZipBuffer(buffer))
}

/**
 * 从 ZIP 文件解析文件条目
 * @param {File} file 用户选择的 ZIP 文件
 * @returns {Promise<FileEntry[]>} 解析后的文件条目
 */
export async function entriesFromZipFile(file) {
	const buffer = await file.arrayBuffer()
	return entriesFromZipBuffer(buffer)
}

/**
 * 从本地文件夹解析文件条目
 * @returns {Promise<FileEntry[]|null>} 本地文件夹条目；不支持或用户取消时为 null
 */
export async function pickFolderEntries() {
	if (!('showDirectoryPicker' in globalThis)) {
		alert(translate('ui.status.unsupportedFolderPicker'))
		return null
	}
	const root = await globalThis.showDirectoryPicker()
	const raw = await walkFolderHandle(root)
	return finalizeRawEntries(raw)
}
