/**
 * 播放控制栏：模式、步进、速度与播放/跳过等
 */

import { emitEvent, EVENTS } from '../core/eventBus.mjs'
import { setElementLocalizeLogic, translate } from '../i18n/uiI18n.mjs'

const DEFAULT_CHARS_PER_SECOND = 22
const SPEED_STEP = 5

/**
 * 判断是否应当忽略键盘快捷键（避免用户在输入框里打字时被抢走）。
 * 注意：我们允许 `range/radio/checkbox` 上继续响应快捷键。
 * @param {EventTarget | null} target 触发快捷键的事件目标。
 * @returns {boolean} 是否应忽略快捷键。
 */
function shouldIgnoreKeyboardShortcut(target) {
	if (!target) return false
	const tagName = target.tagName
	if (tagName === 'TEXTAREA') return true
	if (tagName === 'INPUT') {
		const type = String(target.type || '').toLowerCase()
		const textLikeTypes = [
			'text',
			'password',
			'email',
			'search',
			'url',
			'tel',
			'number',
			'date',
			'datetime-local',
			'month',
			'week',
			'color',
			'file',
		]
		return textLikeTypes.includes(type)
	}
	return !!target.isContentEditable
}

/**
 * 裁剪速度值到 1-500 范围内
 * @param {number} speedValue 需要裁剪的速度值。
 * @returns {number} 裁剪后的合法速度值。
 */
function clampSpeed(speedValue) {
	return Math.max(1, Math.min(500, Number(speedValue) || DEFAULT_CHARS_PER_SECOND))
}

/**
 * 更新速度标签
 * @param {(speed: number) => void} setLabel 更新速度标签（可防抖）
 * @param {number} speedValue 速度
 * @returns {void}
 */
function updateSpeedLabel(setLabel, speedValue) {
	setLabel(speedValue)
}

/**
 * 绑定播放栏控件
 * @param {{
 *   playModeAutoRadio: HTMLInputElement,
 *   playModeManualRadio: HTMLInputElement,
 *   stepByCharacterRadio: HTMLInputElement,
 *   stepByWordRadio: HTMLInputElement,
 *   playbackSpeedRangeInput: HTMLInputElement,
 *   labelSpeedDisplayElement: HTMLElement,
 *   buttonTogglePlaybackElement: HTMLButtonElement,
 *   buttonResetPlaybackElement: HTMLButtonElement,
 *   buttonSkipCurrentFileElement: HTMLButtonElement,
 *   buttonSkipToEndElement: HTMLButtonElement,
 * }} options 播放栏控件与播放器依赖
 * @returns {void}
 */
export function bindPlaybackControls(options) {
	const {
		playModeAutoRadio,
		playModeManualRadio,
		stepByCharacterRadio,
		stepByWordRadio,
		playbackSpeedRangeInput,
		labelSpeedDisplayElement,
		buttonTogglePlaybackElement,
		buttonResetPlaybackElement,
		buttonSkipCurrentFileElement,
		buttonSkipToEndElement,
	} = options

	let labelDebounceTimer = 0
	/**
	 * 防抖更新速度标签文案
	 * @param {number} speedValue 每秒字符数
	 */
	function debouncedSetSpeedLabel(speedValue) {
		window.clearTimeout(labelDebounceTimer)
		labelDebounceTimer = window.setTimeout(() => {
			labelSpeedDisplayElement.dataset.speedValue = String(speedValue)
			labelSpeedDisplayElement.textContent = `${speedValue} ${translate('ui.speed.unit')}`
		}, 80)
	}

	setElementLocalizeLogic(labelSpeedDisplayElement, () => {
		const speedValue = Number(labelSpeedDisplayElement.dataset.speedValue || playbackSpeedRangeInput.value) || DEFAULT_CHARS_PER_SECOND
		labelSpeedDisplayElement.textContent = `${speedValue} ${translate('ui.speed.unit')}`
	})

	/**
	 * 同步滑块与速度标签
	 * @param {number} speedValue 每秒字符数
	 */
	function updateSpeedUi(speedValue) {
		playbackSpeedRangeInput.value = String(speedValue)
		debouncedSetSpeedLabel(speedValue)
	}

	// 初始化视图展示；player 的真实状态由 Controller 根据事件同步
	const initSpeed = clampSpeed(Number(playbackSpeedRangeInput.value) || DEFAULT_CHARS_PER_SECOND)
	updateSpeedUi(initSpeed)

	playModeAutoRadio.addEventListener('change', () => {
		if (playModeAutoRadio.checked)
			emitEvent(EVENTS.CMD_PLAYBACK_SET_MODE_AUTO)

	})
	playModeManualRadio.addEventListener('change', () => {
		if (playModeManualRadio.checked)
			emitEvent(EVENTS.CMD_PLAYBACK_SET_MODE_MANUAL)

	})

	stepByCharacterRadio.addEventListener('change', () => {
		if (stepByCharacterRadio.checked)
			emitEvent(EVENTS.CMD_PLAYBACK_SET_STEP, { step: 'char' })
	})
	stepByWordRadio.addEventListener('change', () => {
		if (stepByWordRadio.checked)
			emitEvent(EVENTS.CMD_PLAYBACK_SET_STEP, { step: 'word' })
	})

	playbackSpeedRangeInput.addEventListener('input', () => {
		const speed = clampSpeed(Number(playbackSpeedRangeInput.value) || DEFAULT_CHARS_PER_SECOND)
		emitEvent(EVENTS.CMD_PLAYBACK_SET_SPEED, { speed })
		updateSpeedUi(speed)
	})

	window.addEventListener('keydown', keyboardEvent => {
		if (shouldIgnoreKeyboardShortcut(keyboardEvent.target)) return
		if (!playModeAutoRadio.checked) return

		const currentSpeed = clampSpeed(Number(playbackSpeedRangeInput.value) || DEFAULT_CHARS_PER_SECOND)
		let newSpeed = currentSpeed

		if (
			keyboardEvent.key === 'ArrowRight' ||
			keyboardEvent.key === 'd' ||
			keyboardEvent.key === 'D'
		) {
			newSpeed = Math.min(500, currentSpeed + SPEED_STEP)
			keyboardEvent.preventDefault()
		} else if (
			keyboardEvent.key === 'ArrowLeft' ||
			keyboardEvent.key === 'a' ||
			keyboardEvent.key === 'A'
		) {
			newSpeed = Math.max(1, currentSpeed - SPEED_STEP)
			keyboardEvent.preventDefault()
		}

		if (newSpeed !== currentSpeed) {
			emitEvent(EVENTS.CMD_PLAYBACK_SET_SPEED, { speed: newSpeed })
			updateSpeedUi(newSpeed)
		}
	})

	buttonTogglePlaybackElement.addEventListener('click', () => {
		emitEvent(EVENTS.CMD_PLAYBACK_TOGGLE_AUTO_PLAY)
	})

	buttonResetPlaybackElement.addEventListener('click', () => {
		emitEvent(EVENTS.CMD_PLAYBACK_RESET)
	})

	buttonSkipCurrentFileElement.addEventListener('click', () => {
		emitEvent(EVENTS.CMD_PLAYBACK_SKIP_FILE)
	})

	buttonSkipToEndElement.addEventListener('click', () => {
		emitEvent(EVENTS.CMD_PLAYBACK_SKIP_TO_END)
	})
}

/**
 * 绑定手动步进与自动模式空格暂停
 * @param {{
 *   playModeAutoRadio: HTMLInputElement,
 *   playModeManualRadio: HTMLInputElement,
 * }} options 手动步进与空格暂停所需依赖
 * @returns {void}
 */
export function bindManualStepKeyboard(options) {
	const { playModeAutoRadio, playModeManualRadio } = options
	window.addEventListener('keydown', keyboardEvent => {
		if (shouldIgnoreKeyboardShortcut(keyboardEvent.target)) return
		if (keyboardEvent.ctrlKey || keyboardEvent.metaKey || keyboardEvent.altKey) return
		if (playModeAutoRadio.checked && keyboardEvent.code === 'Space') {
			keyboardEvent.preventDefault()
			emitEvent(EVENTS.CMD_PLAYBACK_TOGGLE_AUTO_PLAY)
			return
		}
		if (!playModeManualRadio.checked) return
		keyboardEvent.preventDefault()
		emitEvent(EVENTS.CMD_PLAYBACK_STEP_MANUAL)
	})
}
