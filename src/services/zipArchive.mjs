/**
 * ZIP 解压：ArrayBuffer → 原始路径与字节
 */
import { unzipSync } from 'https://esm.sh/fflate'

import { I18nError } from '../i18n/uiI18n.mjs'
import { normalizeSlashes } from '../utils/utils.mjs'

/**
 * 路径与字节条目
 * @typedef {{ path: string, bytes: Uint8Array }} RawEntry
 */

/**
 * 遍历 ZIP 原始字节
 * @param {ArrayBuffer} buffer ZIP 原始字节
 * @returns {RawEntry[]} 路径与字节条目
 */
export function walkZipBuffer(buffer) {
	const uint8Array = new Uint8Array(buffer)
	let files
	try {
		files = unzipSync(uint8Array)
	} catch (error) {
		throw new I18nError('errors.zipUnzipFailed', { detail: error?.message || String(error) })
	}
	const output = []
	for (const path of Object.keys(files)) {
		if (path.endsWith('/')) continue
		const normalizedPath = normalizeSlashes(path)
		const raw = files[path]
		if (!(raw instanceof Uint8Array) || raw.length === 0) continue
		output.push({ path: normalizedPath, bytes: raw })
	}
	return output
}
