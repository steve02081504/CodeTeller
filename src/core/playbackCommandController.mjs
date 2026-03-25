import { onLanguageChange, translate } from '../i18n/uiI18n.mjs'

import { emitEvent, onEvent, EVENTS } from './eventBus.mjs'
import { emitStatus } from './taskRunner.mjs'

/**
 * 播放命令控制器：订阅 UI 命令并操作 player / 播放循环。
 * 目标：让 `app.mjs` 不再把 `player`/控制函数透传给视图绑定层。
 * @param {{
 *   player: any,
 *   startPlaybackLoop: () => void,
 *   stopPlaybackLoop: () => void,
 *   playbackSpeedRangeInput: HTMLInputElement,
 *   buttonTogglePlaybackElement: HTMLButtonElement
 * }} options 控制器所需依赖。
 * @returns {{ syncToggleButtonText: () => void }} 控制器 API。
 */
export function createPlaybackCommandController(options) {
	const {
		player,
		startPlaybackLoop,
		stopPlaybackLoop,
		playbackSpeedRangeInput,
		buttonTogglePlaybackElement,
	} = options

	/**
	 * 应用模式 UI 状态
	 */
	function applyModeUi() {
		const manual = player.mode === 'manual'
		playbackSpeedRangeInput.disabled = manual
		buttonTogglePlaybackElement.disabled = manual
		// 保持原逻辑：切 manual 时不强制改 playing，仅通过 stopLoop 让自动播放停止
		player.playing = !manual || player.playing
	}

	/**
	 * 同步播放按钮文本
	 */
	function syncToggleButtonText() {
		buttonTogglePlaybackElement.textContent = player.playing ? translate('ui.playback.pause') : translate('ui.playback.play')
	}

	/**
	 * 处理重置命令
	 */
	function handleReset() {
		player.reset()
		emitEvent(EVENTS.PLAYBACK_NEEDS_RENDER)
		emitStatus('ui.status.resetToStart')
		if (player.mode === 'auto' && player.playing) startPlaybackLoop()
		else stopPlaybackLoop()
	}

	/**
	 * 处理跳过文件命令
	 */
	function handleSkipFile() {
		player.skipFile()
		emitEvent(EVENTS.PLAYBACK_NEEDS_RENDER)
	}

	/**
	 * 处理跳过到末尾命令
	 */
	function handleSkipToEnd() {
		player.skipAll()
		emitEvent(EVENTS.PLAYBACK_NEEDS_RENDER)
		stopPlaybackLoop()
		emitStatus('ui.status.skipToEnd')
	}

	/**
	 * 处理手动步进命令
	 */
	function handleStepManual() {
		if (player.mode !== 'manual' || player.done) return
		player.stepManual()
		emitEvent(EVENTS.PLAYBACK_NEEDS_RENDER)
		if (player.done) emitStatus('ui.status.playbackFinished')
	}

	onEvent(EVENTS.CMD_PLAYBACK_SET_MODE_AUTO, () => {
		player.mode = 'auto'
		player.playing = true
		applyModeUi()
		syncToggleButtonText()
		if (!player.done) startPlaybackLoop()
	})

	onEvent(EVENTS.CMD_PLAYBACK_SET_MODE_MANUAL, () => {
		player.mode = 'manual'
		applyModeUi()
		stopPlaybackLoop()
	})

	onEvent(EVENTS.CMD_PLAYBACK_SET_STEP, ({ step }) => {
		player.step = step === 'word' ? 'word' : 'char'
	})

	onEvent(EVENTS.CMD_PLAYBACK_SET_SPEED, ({ speed }) => {
		player.charsPerSecond = Math.max(1, Number(speed) || player.charsPerSecond)
	})

	onEvent(EVENTS.CMD_PLAYBACK_TOGGLE_AUTO_PLAY, () => {
		if (player.mode === 'manual') return
		player.playing = !player.playing
		syncToggleButtonText()
		if (player.playing && !player.done) startPlaybackLoop()
		else stopPlaybackLoop()
	})

	onEvent(EVENTS.CMD_PLAYBACK_RESET, handleReset)
	onEvent(EVENTS.CMD_PLAYBACK_SKIP_FILE, handleSkipFile)
	onEvent(EVENTS.CMD_PLAYBACK_SKIP_TO_END, handleSkipToEnd)
	onEvent(EVENTS.CMD_PLAYBACK_STEP_MANUAL, handleStepManual)

	// 初始化 UI 状态（依赖 app 在调用此 controller 前已根据 UI 填好 player.mode/step/charsPerSecond）
	applyModeUi()
	syncToggleButtonText()

	onLanguageChange(() => syncToggleButtonText())

	return {
		syncToggleButtonText,
	}
}

