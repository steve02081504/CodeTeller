import { STORAGE_KEYS } from './core/constants.mjs'
import { onEvent, EVENTS } from './core/eventBus.mjs'
import { validateFileContent } from './core/fileProcessor.mjs'
import { createPlaybackCommandController } from './core/playbackCommandController.mjs'
import { createPlaybackEngine } from './core/PlaybackEngine.mjs'
import { TypewriterPlayer } from './core/player/index.mjs'
import { runWithStatus } from './core/taskRunner.mjs'
import {
	resolveThemeMode,
	applyThemeMode,
	syncPageThemeByPreference,
	bindThemeAutoSync,
} from './core/theme.mjs'
import { uiStore } from './core/uiStore.mjs'
import { initI18n, translate } from './i18n/uiI18n.mjs'
import { loadGithub, parseRepo } from './services/github.mjs'
import { createSourceLoader } from './services/loader.mjs'
import { bindAppTranslations } from './ui/appTranslations.mjs'
import { createCodeRenderer } from './ui/codeRenderer.mjs'
import { renderFileList as renderFileListTree } from './ui/fileTree.mjs'
import { bindGithubRepositoryControls } from './ui/githubController.mjs'
import { bindManualStepKeyboard, bindPlaybackControls } from './ui/playbackController.mjs'
import { createToastUi } from './ui/toastUi.mjs'
import { createRafDriver } from './utils/rafDriver.mjs'
import { normalizeSlashes } from './utils/utils.mjs'

const fileListContainerElement = document.getElementById('file-tree-list')
const filePathBarElement = document.getElementById('path-display-bar')
const codeDisplayElement = document.getElementById('code-display')

const openFolderButton = document.getElementById('open-folder-button')
const openZipButton = document.getElementById('open-zip-button')
const zipFileInputElement = document.getElementById('zip-input')

const inputGithubUrlElement = document.getElementById('github-url-input')
const buttonLoadGithubElement = document.getElementById('load-github-button')
const inputGithubTokenElement = document.getElementById('github-token-input')

const themeModeSelect = document.getElementById('theme-select')

const playModeAutoRadio = document.getElementById('auto-mode-radio')
const playModeManualRadio = document.getElementById('manual-mode-radio')
const stepByCharacterRadio = document.getElementById('char-step-radio')
const stepByWordRadio = document.getElementById('word-step-radio')
const playbackSpeedRangeInput = document.getElementById('playback-speed-range')
const labelSpeedDisplayElement = document.getElementById('speed-display-label')
const buttonTogglePlaybackElement = document.getElementById('toggle-playback-button')
const buttonResetPlaybackElement = document.getElementById('reset-playback-button')
const buttonSkipCurrentFileElement = document.getElementById('skip-file-button')
const buttonSkipToEndElement = document.getElementById('skip-to-end-button')
const topNavbarElement = document.getElementById('top-navbar')
const bottomControlBarElement = document.getElementById('bottom-control-bar')

const player = new TypewriterPlayer()
const codeView = createCodeRenderer({ codeElement: codeDisplayElement })
const { setStatus, setError } = createToastUi()
const requestAnimationFrameDriver = createRafDriver()

onEvent(EVENTS.APP_SET_STATUS, ({ message, isError }) => {
	setStatus(message, !!isError)
})

onEvent(EVENTS.APP_SET_ERROR, ({ error }) => {
	setError(error)
})

onEvent(EVENTS.PLAYBACK_NEEDS_RENDER, () => {
	renderCode()
})

/**
 * 标记文件树脏并重新渲染
 */
function markTreeDirtyAndRender() {
	uiStore.fileListDirty = true
	renderCode()
}

/**
 * 渲染代码
 */
function renderCode() {
	const currentPath = player.currentPath || ''
	filePathBarElement.textContent = currentPath || '—'
	codeView.renderEditorWithCursor({
		text: player.visibleSlice,
		cursorIndex: player.cursorIndex,
		path: currentPath,
		lang: player.currentShikiLang,
	})
	if (
		uiStore.fileListDirty
		|| currentPath !== uiStore.lastRenderedPath
		|| player.phase !== uiStore.lastRenderedPhase
	) {
		const renderResult = renderFileListTree({
			fileListEl: fileListContainerElement,
			player,
			collapsedDirs: uiStore.collapsedDirectoryPaths,
			onMutate: markTreeDirtyAndRender,
		})
		uiStore.lastRenderedPath = renderResult.lastRenderedPath
		uiStore.lastRenderedPhase = player.phase
		uiStore.fileListDirty = false
	}
}

const { startPlaybackLoop, stopPlaybackLoop, handleWindowBlur, handleWindowFocus } = createPlaybackEngine({
	player,
	uiStore,
	renderCode,
	buttonTogglePlaybackElement,
	requestAnimationFrameDriver,
})

const { loadEntries, loadZipFromFile, loadZipFromUrl, pickAndLoadFolderWithWorkerStreaming } = createSourceLoader({
	player,
	renderCode,
	startPlaybackLoop,
	stopPlaybackLoop,
})

/**
 * 绑定源码操作
 */
function bindSourceActions() {
	openFolderButton.addEventListener('click', () => void pickAndLoadFolderWithWorkerStreaming())

	openZipButton.addEventListener('click', () => zipFileInputElement.click())
	zipFileInputElement.addEventListener('change', async () => {
		const zipFile = zipFileInputElement.files?.[0]
		if (!zipFile) return
		await loadZipFromFile(zipFile)
		zipFileInputElement.value = ''
	})

	bindGithubRepositoryControls({
		inputGithubUrlElement,
		buttonLoadGithubElement,
		inputGithubTokenElement,
		githubTokenStorageKey: STORAGE_KEYS.githubToken,
		loadGithub,
		onRepositoryEntriesLoaded: loadEntries,
	})
}

/**
 * 绑定播放操作
 */
function bindPlaybackActionsModule() {
	bindPlaybackControls({
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
	})
}

/**
 * 绑定主题控制
 */
function bindThemeControls() {
	if (!themeModeSelect) return
	themeModeSelect.value = resolveThemeMode()
	themeModeSelect.addEventListener('change', () => {
		applyThemeMode(themeModeSelect.value || 'auto', themeModeSelect)
		renderCode()
	})
}

/**
 * 判断是否为 ZIP 链接
 * @param {string} sourceUrl 输入链接
 * @returns {boolean} 是否为 ZIP 链接
 */
function isZipUrl(sourceUrl) {
	try {
		return /\.zip$/iu.test(new URL(sourceUrl).pathname)
	} catch {
		return /\.zip(?:$|[?#])/iu.test(sourceUrl)
	}
}

/**
 * 从 URL 参数自动加载数据源
 * 支持参数：`?url=` 或 `?source=`
 * @returns {Promise<void>}
 */
async function autoLoadSourceFromUrlParameter() {
	const params = new URLSearchParams(window.location.search)
	const sourceUrl = (params.get('url') || params.get('source') || '').trim()
	if (!sourceUrl) return

	if (isZipUrl(sourceUrl)) {
		await loadZipFromUrl(sourceUrl)
		return
	}

	try {
		parseRepo(sourceUrl)
		inputGithubUrlElement.value = sourceUrl
		const token = inputGithubTokenElement.value.trim()
		const entries = await runWithStatus('ui.status.loadFromGithub', () =>
			loadGithub(sourceUrl, { token: token || undefined }),
		)
		if (entries) await loadEntries(entries)
	} catch {
		// 非 GitHub 且非 ZIP 时忽略；避免阻断页面启动
	}
}

/**
 * 初始化播放器设置
 */
function initPlayerSettingsFromUi() {
	player.mode = playModeAutoRadio.checked ? 'auto' : 'manual'
	player.step = stepByCharacterRadio.checked ? 'char' : 'word'
	player.charsPerSecond = Math.max(1, Number(playbackSpeedRangeInput.value) || 22)
}

/**
 * 从拖拽文本中提取 GitHub 仓库信息
 * @param {DataTransfer} dataTransfer 拖拽数据
 * @returns {string} `owner/repo` 或空字符串
 */
function extractDroppedGithubRepo(dataTransfer) {
	const uriList = String(dataTransfer.getData('text/uri-list') || '')
		.split(/\r?\n/)
		.map(line => line.trim())
		.filter(line => line && !line.startsWith('#'))
	const plainText = String(dataTransfer.getData('text/plain') || '').trim()
	const candidates = [...uriList]
	if (plainText) candidates.push(plainText)
	for (const candidate of candidates)
		try {
			const { owner, repo } = parseRepo(candidate)
			return `${owner}/${repo}`
		} catch {
			/* 不是有效的 GitHub 仓库输入 */
		}

	return ''
}

/**
 * 读取拖入的普通文本文件条目（非 ZIP）
 * @param {FileList} files 拖入文件列表
 * @returns {Promise<Array<{ path: string, content: string }>>} 可展示条目
 */
async function readDroppedTextEntries(files) {
	const entries = []
	for (const file of files) {
		const entryPath = normalizeSlashes(file.webkitRelativePath || file.name || '')
		if (!entryPath || /\.zip$/iu.test(entryPath)) continue
		const bytes = new Uint8Array(await file.arrayBuffer())
		const text = validateFileContent(bytes, entryPath)
		if (text === null) continue
		entries.push({ path: entryPath, content: text })
	}
	return entries
}

/**
 * 绑定页面拖放（文件 / 文件夹 / GitHub URL）
 */
function bindPageDragDrop() {
	window.addEventListener('dragover', dragEvent => {
		dragEvent.preventDefault()
	})
	window.addEventListener('drop', async dragEvent => {
		dragEvent.preventDefault()
		const dataTransfer = dragEvent.dataTransfer
		if (!dataTransfer) return

		const droppedRepo = extractDroppedGithubRepo(dataTransfer)
		if (droppedRepo) {
			const token = inputGithubTokenElement.value.trim()
			const entries = await runWithStatus('ui.status.loadFromGithub', () =>
				loadGithub(droppedRepo, { token: token || undefined }),
			)
			if (entries) await loadEntries(entries)
			return
		}

		const droppedFiles = dataTransfer.files
		if (!droppedFiles || droppedFiles.length === 0) return
		if (droppedFiles.length === 1 && /\.zip$/iu.test(droppedFiles[0].name || '')) {
			await loadZipFromFile(droppedFiles[0])
			return
		}
		const textEntries = await readDroppedTextEntries(droppedFiles)
		await loadEntries(textEntries)
	})
}

/**
 * 绑定窗口焦点和模糊操作
 */
function bindWindowFocusAndBlurActions() {
	window.addEventListener('blur', () => {
		handleWindowBlur()

		const playbackState = {
			currentFileIndex: player.currentFileIndex,
			sourcePosition: player.sourcePos,
			currentPath: player.currentPath,
		}
		try {
			localStorage.setItem(STORAGE_KEYS.playbackState, JSON.stringify(playbackState))
		} catch {
			/* 存储配额或隐私模式 */
		}
	})

	window.addEventListener('focus', () => {
		handleWindowFocus()
	})
}

/**
 * 手动打字模式下：鼠标靠近上下边缘时显示顶部/底部栏，远离时隐藏
 */
function bindManualModeProximityChrome() {
	if (!topNavbarElement || !bottomControlBarElement) return
	const bodyElement = document.body
	const edgeTriggerDistancePx = 7

	// 解决"鼠标一离开触发区就立刻隐藏导致无法点击"的问题：
	// - 触发区负责"允许显示"
	// - 只要鼠标悬停在控件本身，就保持显示
	let isTopHovered = false
	let isBottomHovered = false
	let lastMouseClientY = null

	/**
	 * 清除手动模式下的靠近状态
	 */
	function clearProximityState() {
		isTopHovered = false
		isBottomHovered = false
		lastMouseClientY = null
		bodyElement.classList.remove('manual-near-top', 'manual-near-bottom')
	}

	/**
	 * 更新手动模式状态
	 */
	function updateManualModeState() {
		if (playModeManualRadio.checked) {
			bodyElement.classList.add('manual-proximity-hide')
			return
		}
		bodyElement.classList.remove('manual-proximity-hide')
		clearProximityState()
	}

	/**
	 * 应用手动模式下的靠近状态
	 */
	function applyProximityFromLastMouse() {
		if (!bodyElement.classList.contains('manual-proximity-hide')) return
		if (lastMouseClientY == null) return

		const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0
		const nearTop = lastMouseClientY <= edgeTriggerDistancePx
		const nearBottom = lastMouseClientY >= Math.max(0, viewportHeight - edgeTriggerDistancePx)

		bodyElement.classList.toggle('manual-near-top', nearTop || isTopHovered)
		bodyElement.classList.toggle('manual-near-bottom', nearBottom || isBottomHovered)
	}

	/**
	 * 记录鼠标 y 坐标并更新手动靠近状态。
	 * @param {MouseEvent} mouseEvent 鼠标移动事件。
	 * @returns {void}
	 */
	function onMouseMove(mouseEvent) {
		lastMouseClientY = mouseEvent.clientY
		applyProximityFromLastMouse()
	}

	window.addEventListener('mousemove', onMouseMove)
	window.addEventListener('mouseleave', clearProximityState)

	// 鼠标悬停在控件上时，强制保持可交互
	topNavbarElement.addEventListener('mouseenter', () => {
		if (!playModeManualRadio.checked) return
		isTopHovered = true
		bodyElement.classList.add('manual-proximity-hide')
		bodyElement.classList.add('manual-near-top')
	})
	topNavbarElement.addEventListener('mouseleave', () => {
		isTopHovered = false
		applyProximityFromLastMouse()
	})

	bottomControlBarElement.addEventListener('mouseenter', () => {
		if (!playModeManualRadio.checked) return
		isBottomHovered = true
		bodyElement.classList.add('manual-proximity-hide')
		bodyElement.classList.add('manual-near-bottom')
	})
	bottomControlBarElement.addEventListener('mouseleave', () => {
		isBottomHovered = false
		applyProximityFromLastMouse()
	})
	playModeAutoRadio.addEventListener('change', updateManualModeState)
	playModeManualRadio.addEventListener('change', updateManualModeState)
	updateManualModeState()
}

/**
 * 绑定事件
 */
async function wire() {
	await initI18n()
	await bindAppTranslations()
	syncPageThemeByPreference(themeModeSelect)
	const storedGithubToken = localStorage.getItem(STORAGE_KEYS.githubToken)
	if (storedGithubToken) inputGithubTokenElement.value = storedGithubToken

	bindSourceActions()
	bindPlaybackActionsModule()
	bindManualStepKeyboard({ playModeAutoRadio, playModeManualRadio })
	bindPageDragDrop()
	bindThemeAutoSync({ themeSelectEl: themeModeSelect, onThemeChange: renderCode })
	bindThemeControls()
	bindWindowFocusAndBlurActions()
	bindManualModeProximityChrome()
	initPlayerSettingsFromUi()
	createPlaybackCommandController({
		player,
		startPlaybackLoop,
		stopPlaybackLoop,
		playbackSpeedRangeInput,
		buttonTogglePlaybackElement,
	})
	uiStore.fileListDirty = true
	setStatus(translate('ui.status.pickSource'))
	await autoLoadSourceFromUrlParameter()
}

void wire().catch(error => setError(error))
