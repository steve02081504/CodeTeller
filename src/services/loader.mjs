import { NOCORS_BASE } from '../core/config.mjs'
import { prepareSegments, SegmentBuildSession } from '../core/stream.mjs'
import { runWithStatus, emitStatus, emitError } from '../core/taskRunner.mjs'
import { uiStore } from '../core/uiStore.mjs'

import { isFolderWorkerSupported, startFolderEntryStream } from './folderStream.mjs'
import { entriesFromDirectoryHandle, entriesFromZipFile, entriesFromZipBuffer } from './sources.mjs'

/**
 * 从「文件条目」到播放器加载（ZIP / GitHub / 主线程目录）
 * @param {{
 *   player: import('../core/player/index.mjs').TypewriterPlayer,
 *   renderCode: () => void,
 *   startPlaybackLoop: () => void,
 *   stopPlaybackLoop: () => void,
 * }} ctx 共享依赖
 * @returns {{
 *   loadEntries: (entries: Array<{ path: string, content: string }>) => Promise<void>,
 *   loadZipFromFile: (zipFile: File) => Promise<void>,
 *   loadZipFromUrl: (zipUrl: string) => Promise<void>,
 *   pickAndLoadFolderWithWorkerStreaming: () => Promise<void>,
 * }} 创建的加载器 API
 */
export function createSourceLoader(ctx) {
	const {
		player,
		renderCode,
		startPlaybackLoop,
		stopPlaybackLoop,
	} = ctx

	/**
	 * 加载文件条目
	 * @param {Array<{ path: string, content: string }>} entries 文件条目
	 * @returns {Promise<void>}
	 */
	async function loadEntries(entries) {
		player.dispose()
		if (!entries || entries.length === 0) {
			emitStatus('ui.status.noTextFiles', {}, true)
			return
		}
		const segments = prepareSegments(entries)
		if (segments.length === 0) {
			emitStatus('ui.status.noFilesAfterFilter', {}, true)
			return
		}
		player.load(segments)
		uiStore.collapsedDirectoryPaths.clear()
		uiStore.fileListDirty = true
		emitStatus('ui.status.loadedFiles', { count: segments.length })
		renderCode()
		if (player.mode === 'auto' && player.playing) startPlaybackLoop()
		else stopPlaybackLoop()
	}

	/**
	 * 从 ZIP 文件加载文件条目
	 * @param {File} zipFile 用户选择的 ZIP
	 * @returns {Promise<void>}
	 */
	async function loadZipFromFile(zipFile) {
		const entries = await runWithStatus('ui.status.unzipZip', () => entriesFromZipFile(zipFile))
		if (entries) await loadEntries(entries)
	}

	/**
	 * 从 ZIP URL 下载并加载文件条目（先直连，失败后回退代理）
	 * @param {string} zipUrl ZIP 下载链接
	 * @returns {Promise<void>}
	 */
	async function loadZipFromUrl(zipUrl) {
		const entries = await runWithStatus('ui.status.unzipZip', async () => {
			const directResponse = await fetch(zipUrl).catch(() => null)
			if (directResponse?.ok) return entriesFromZipBuffer(await directResponse.arrayBuffer())

			const proxiedUrl = NOCORS_BASE + encodeURIComponent(zipUrl)
			const proxiedResponse = await fetch(proxiedUrl)
			if (!proxiedResponse.ok)
				throw new Error(`Failed to download zip: ${proxiedResponse.status}`)
			return entriesFromZipBuffer(await proxiedResponse.arrayBuffer())
		})
		if (entries) await loadEntries(entries)
	}

	/**
	 * 选择目录：优先 Worker 流式；不支持或失败时回退主线程一次性读取
	 * @returns {Promise<void>}
	 */
	async function pickAndLoadFolderWithWorkerStreaming() {
		if (!('showDirectoryPicker' in globalThis)) {
			emitStatus('ui.status.unsupportedFolderPicker', {}, true)
			return
		}
		const directoryHandle = await globalThis.showDirectoryPicker()

		// Worker 不可用时回退到主线程一次性读取，避免 `new Worker()` 直接抛错
		if (!isFolderWorkerSupported()) {
			const entries = await runWithStatus('ui.status.workerNotSupported', () =>
				entriesFromDirectoryHandle(directoryHandle),
			)
			if (entries) await loadEntries(entries)
			return
		}

		player.dispose()
		player.beginStreamingPlayback()
		uiStore.collapsedDirectoryPaths.clear()
		uiStore.fileListDirty = true
		uiStore.lastPaintSignature = ''

		emitStatus('ui.status.workerScanning')
		const segmentSession = new SegmentBuildSession()
		/**
		 * 停止 Worker
		 * @returns {void}
		 */
		let stopWorker = () => { }
		let receivedFirstSegment = false

		stopWorker = startFolderEntryStream(directoryHandle, {
			/**
			 * 处理文件条目
			 * @param {{ path: string, content: string }} fileEntry 路径与文本内容
			 */
			onFileEntry(fileEntry) {
				const { segment, stopped } = segmentSession.tryAddFileEntry(fileEntry)
				if (!segment) {
					if (stopped) stopWorker()
					return
				}
				player.appendSegment(segment)
				if (!receivedFirstSegment) {
					receivedFirstSegment = true
					emitStatus('ui.status.workerStartedPlayback')
				}
				uiStore.fileListDirty = true
				uiStore.lastPaintSignature = ''
				renderCode()
				if (player.mode === 'auto' && player.playing) startPlaybackLoop()
				if (stopped) stopWorker()
			},
			/**
			 * 完成工作
			 */
			onComplete() {
				stopWorker()
				if (player.segments.length === 0) emitStatus('ui.status.noTextFiles', {}, true)
				else emitStatus('ui.status.workerLoadedFiles', { count: player.segments.length })
			},
			/**
			 * 处理错误
			 * @param {Error} error 错误对象
			 */
			async onError(error) {
				emitError(error)
				stopWorker()
				const entries = await runWithStatus('ui.status.workerFailedFallback', () =>
					entriesFromDirectoryHandle(directoryHandle),
				)
				if (entries) await loadEntries(entries)
			},
		})
	}

	return { loadEntries, loadZipFromFile, loadZipFromUrl, pickAndLoadFolderWithWorkerStreaming }
}
