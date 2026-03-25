import { highlightMetaForPath } from '../utils/highlightLang.mjs'
import { isSkippedPath } from '../utils/utils.mjs'

import { LIMITS } from './config.mjs'


/**
 * 文件条目
 * @typedef {{ path: string, content: string }} FileEntry
 */

/**
 * 准备段
 * @typedef {{ path: string, text: string, extension: string, shikiLang: string }} PreparedSegment
 */

/**
 * 流式累积时的单文件「段」构建：与 `prepareSegments` 共享截断与总字数上限逻辑
 */
export class SegmentBuildSession {
	/** @type {number} */
	#totalCharacters = 0
	/** @type {number} */
	#fileCount = 0
	/** @type {boolean} */
	#stoppedByTotalCap = false

	/**
	 * 尝试添加文件条目
	 * @param {FileEntry} fileEntry 单文件路径与内容
	 * @returns {{ segment: PreparedSegment | null, stopped: boolean }} 新段（若可加入）与是否已达上限需停止
	 */
	tryAddFileEntry(fileEntry) {
		if (this.#stoppedByTotalCap || this.#fileCount >= LIMITS.maxFiles)
			return { segment: null, stopped: true }

		let text = fileEntry.content
		if (text.length > LIMITS.maxFileChars)
			text = text.slice(0, LIMITS.maxFileChars) + '\n\n/* …截断… */\n'

		const meta = highlightMetaForPath(fileEntry.path)

		if (this.#totalCharacters + text.length > LIMITS.maxTotalChars) {
			const remaining = LIMITS.maxTotalChars - this.#totalCharacters
			if (remaining <= 0) {
				this.#stoppedByTotalCap = true
				return { segment: null, stopped: true }
			}
			text = text.slice(0, remaining) + '\n\n/* …总字数上限… */\n'
			this.#totalCharacters += text.length
			this.#fileCount++
			this.#stoppedByTotalCap = true
			return {
				segment: {
					path: fileEntry.path,
					text,
					extension: meta.extension,
					shikiLang: meta.shikiLang,
				},
				stopped: true,
			}
		}

		this.#totalCharacters += text.length
		this.#fileCount++
		return {
			segment: {
				path: fileEntry.path,
				text,
				extension: meta.extension,
				shikiLang: meta.shikiLang,
			},
			stopped: false,
		}
	}
}

/**
 * 过滤与截断后生成「段」列表（路径归一化与排序已在 `pipeline.finalizeRawEntries` / Worker 中完成，此处不再重复）
 * @param {FileEntry[]} raw 已就绪的文件条目
 * @returns {PreparedSegment[]} 供播放器使用的段列表
 */
export function prepareSegments(raw) {
	const list = raw.filter(entry => entry.path && !isSkippedPath(entry.path))
	const output = []
	let total = 0
	for (const entry of list) {
		if (output.length >= LIMITS.maxFiles) break
		let text = entry.content
		if (text.length > LIMITS.maxFileChars)
			text = text.slice(0, LIMITS.maxFileChars) + '\n\n/* …截断… */\n'
		const meta = highlightMetaForPath(entry.path)
		if (total + text.length > LIMITS.maxTotalChars) {
			const rest = LIMITS.maxTotalChars - total
			if (rest <= 0) break
			text = text.slice(0, rest) + '\n\n/* …总字数上限… */\n'
			output.push({
				path: entry.path,
				text,
				extension: meta.extension,
				shikiLang: meta.shikiLang,
			})
			break
		}
		output.push({
			path: entry.path,
			text,
			extension: meta.extension,
			shikiLang: meta.shikiLang,
		})
		total += text.length
	}
	return output
}
