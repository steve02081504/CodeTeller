import { translate } from '../i18n/uiI18n.mjs'

import { computePaintSig } from './player/snapshot.mjs'
import { emitStatus } from './taskRunner.mjs'

/**
 * 封装 RAF 播放循环与帧渲染触发，减轻 `app.mjs` 编排职责
 * @param {{
 *   player: import('./player/index.mjs').TypewriterPlayer,
 *   uiStore: { fileListDirty: boolean, lastPaintSignature: string },
 *   renderCode: () => void,
 *   buttonTogglePlaybackElement: HTMLButtonElement,
 *   requestAnimationFrameDriver: { startLoop: (cb: (dt: number) => boolean) => void, stopLoop: () => void },
 * }} options 播放器与 UI 依赖
 * @returns {{ startPlaybackLoop: () => void, stopPlaybackLoop: () => void }} 播放循环控制器
 */
export function createPlaybackEngine(options) {
	const {
		player,
		uiStore,
		renderCode,
		buttonTogglePlaybackElement,
		requestAnimationFrameDriver,
	} = options

	let wasPlayingBeforeWindowBlur = false

	/**
	 * 播放帧回调
	 * @param {number} deltaTimeMilliseconds 帧间隔（毫秒）
	 * @returns {boolean} 是否继续下一帧 RAF
	 */
	function onPlaybackFrame(deltaTimeMilliseconds) {
		player.tick(deltaTimeMilliseconds)
		const paintSignature = computePaintSig(player)
		if (uiStore.fileListDirty || paintSignature !== uiStore.lastPaintSignature) {
			uiStore.lastPaintSignature = paintSignature
			renderCode()
		}
		if (player.done) {
			if (player.segments.length > 0) emitStatus('ui.status.playbackFinished')
			buttonTogglePlaybackElement.textContent = translate('ui.playback.play')
			return false
		}
		return true
	}

	/**
	 * 启动播放循环
	 */
	function startPlaybackLoop() {
		requestAnimationFrameDriver.startLoop(onPlaybackFrame)
	}

	/**
	 * 停止播放循环
	 */
	function stopPlaybackLoop() {
		requestAnimationFrameDriver.stopLoop()
	}

	/**
	 * 处理窗口失去焦点
	 * @returns {void}
	 */
	function handleWindowBlur() {
		wasPlayingBeforeWindowBlur = player.playing

		if (player.playing && player.mode === 'auto') {
			player.playing = false
			buttonTogglePlaybackElement.textContent = translate('ui.playback.play')
			stopPlaybackLoop()
			emitStatus('ui.status.blurAutoPause')
		}
	}

	/**
	 * 处理窗口获得焦点
	 * @returns {void}
	 */
	function handleWindowFocus() {
		if (wasPlayingBeforeWindowBlur && player.mode === 'auto' && !player.done) {
			player.playing = true
			buttonTogglePlaybackElement.textContent = translate('ui.playback.pause')
			startPlaybackLoop()
			emitStatus('ui.status.restorePlayback')
		}
	}

	return { startPlaybackLoop, stopPlaybackLoop, handleWindowBlur, handleWindowFocus }
}
