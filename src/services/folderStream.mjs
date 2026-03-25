/**
 * 主线程：启动目录遍历 Worker 并接收流式文件条目
 */

import { I18nError } from '../i18n/uiI18n.mjs'

/**
 * 启动目录遍历 Worker 并接收流式文件条目
 * @param {FileSystemDirectoryHandle} directoryHandle 用户选择的目录句柄
 * @param {{
 *   onFileEntry: (entry: { path: string, content: string }) => void,
 *   onComplete: () => void,
 *   onError: (error: Error) => void,
 * }} callbacks Worker 推送与完成/错误回调
 * @returns {() => void} 终止 Worker
 */
export function startFolderEntryStream(directoryHandle, callbacks) {
	const worker = new Worker(new URL('../workers/folderEntries.worker.mjs', import.meta.url), {
		type: 'module',
	})

	const IDLE_MS = 120_000
	let idleTimer = 0

	/**
	 * 清除空闲计时器
	 */
	function clearIdleTimer() {
		if (idleTimer) window.clearTimeout(idleTimer)
		idleTimer = 0
	}

	/**
	 * 重置空闲计时器
	 */
	function resetIdleTimer() {
		clearIdleTimer()
		idleTimer = window.setTimeout(() => {
			done()
			worker.terminate()
			callbacks.onError(new I18nError('errors.directoryScanTimeout'))
		}, IDLE_MS)
	}

	/**
	 * 完成工作
	 */
	function done() {
		clearIdleTimer()
	}

	resetIdleTimer()

	/**
	 * 接收 Worker 的条目、完成或错误消息
	 * @param {MessageEvent} event `postMessage` 事件
	 */
	worker.onmessage = event => {
		resetIdleTimer()
		const { type, payload } = event.data || {}
		if (type === 'PING') return
		if (type === 'FILE_ENTRY') callbacks.onFileEntry(payload)
		else if (type === 'COMPLETE') {
			done()
			callbacks.onComplete()
		} else if (type === 'ERROR') {
			done()
			callbacks.onError(new I18nError('errors.workerErrorWithMessage', {
				message: String(payload?.message || 'unknown'),
			}))
		}
	}

	/**
	 * Worker 脚本加载或执行异常
	 * @param {ErrorEvent} errorEvent 错误事件
	 */
	worker.onerror = errorEvent => {
		done()
		callbacks.onError(new I18nError('errors.workerInitFailed'))
	}

	worker.postMessage({ type: 'START', directoryHandle })
	return () => {
		done()
		worker.terminate()
	}
}

/**
 * 判断当前环境是否支持 Worker 与目录句柄 API
 * @returns {boolean} 当前环境是否支持 Worker 与目录句柄 API
 */
export function isFolderWorkerSupported() {
	return typeof Worker !== 'undefined' && typeof FileSystemDirectoryHandle !== 'undefined'
}
