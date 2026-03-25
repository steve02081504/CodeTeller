import { PlayerPhase } from '../core/player/phase.mjs'
import { buildTreeItems } from '../core/treeModel.mjs'
import { uiStore } from '../core/uiStore.mjs'
import { ancestorDirectoryPrefixes } from '../utils/pathPrefix.mjs'

/**
 * 过滤可见树行
 * @param {Array<{ path: string, depth: number, isFile: boolean, name: string, isActive: boolean, isDraft: boolean }>} items 扁平树行
 * @param {Set<string>} collapsedDirs 折叠目录
 * @returns {Array<{ path: string, depth: number, isFile: boolean, name: string, isActive: boolean, isDraft: boolean }>} 过滤后的可见树行
 */
function filterVisibleTreeItems(items, collapsedDirs) {
	return items.filter(item => {
		for (const prefix of collapsedDirs)
			if (item.path !== prefix && item.path.startsWith(`${prefix}/`)) return false
		return true
	})
}

/**
 * 构建树结构签名
 * @param {string[]} createdPaths 已创建路径
 * @param {Set<string>} collapsedDirs 折叠目录
 * @returns {string} 树结构签名（用于增量渲染判断）
 */
function treeStructureSignature(createdPaths, collapsedDirs) {
	return `${createdPaths.join('\0')}|\u241E|${[...collapsedDirs].sort().join('\0')}`
}

let delegatedClickBound = false
/** @type {{ player: any, collapsedDirs: Set<string>, onMutate: () => void } | null} */
let delegatedClickContext = null

/**
 * 确保只绑定一次点击事件代理
 * @param {HTMLElement} fileListEl 文件列表容器元素
 * @returns {void}
 */
function ensureDelegatedClickListener(fileListEl) {
	if (delegatedClickBound) return
	fileListEl.addEventListener('click', event => {
		const ctx = delegatedClickContext
		if (!ctx) return

		const target = event.target
		const li = target instanceof Element ? target.closest('.tree-item') : null
		if (!(li instanceof HTMLElement)) return

		const path = li.getAttribute('data-path')
		if (!path) return

		const isDir = li.classList.contains('tree-dir')
		if (isDir) {
			if (ctx.collapsedDirs.has(path)) ctx.collapsedDirs.delete(path)
			else ctx.collapsedDirs.add(path)
			ctx.onMutate()
			return
		}

		if (!ctx.player.done) return
		ctx.player.selectPath(path)
		ctx.onMutate()
	})
	delegatedClickBound = true
}

/**
 * 文件树 DOM 渲染（树数据由 `treeModel.buildTreeItems` 从播放器快照生成）
 * @param {{
 *   fileListEl: HTMLElement,
 *   player: {
 *     currentPath: string,
 *     done: boolean,
 *     createdPaths: string[],
 *     phase: string,
 *     selectPath: (p: string) => void,
 *   },
 *   collapsedDirs: Set<string>,
 *   onMutate: () => void,
 * }} options 容器、播放器与折叠状态
 * @returns {{ lastRenderedPath: string }} 当前高亮路径（用于增量更新）
 */
export function renderFileList({ fileListEl, player, collapsedDirs, onMutate }) {
	delegatedClickContext = { player, collapsedDirs, onMutate }
	ensureDelegatedClickListener(fileListEl)

	const currentPath = player.currentPath
	if (currentPath)
		for (const prefix of ancestorDirectoryPrefixes(currentPath))
			collapsedDirs.delete(prefix)

	const items = buildTreeItems({
		createdPaths: player.createdPaths,
		currentPath,
		isRenamePhase: player.phase === PlayerPhase.RENAME,
	})
	const visibleItems = filterVisibleTreeItems(items, collapsedDirs)
	const structureSig = treeStructureSignature(player.createdPaths, collapsedDirs)

	const canTryClassOnly =
		!uiStore.fileListDirty
		&& fileListEl.children.length > 0
		&& structureSig === uiStore.lastTreeStructureSig
		&& visibleItems.length === fileListEl.children.length

	if (canTryClassOnly) {
		let ok = true
		for (let i = 0; i < visibleItems.length; i++) {
			const item = visibleItems[i]
			const li = fileListEl.children[i]
			if (!(li instanceof HTMLElement) || li.getAttribute('data-path') !== item.path) {
				ok = false
				break
			}
			li.classList.toggle('bg-primary', item.isActive)
			li.classList.toggle('text-primary-content', item.isActive)
			li.classList.toggle('opacity-70', !item.isActive)
			li.classList.toggle('italic', item.isDraft)
		}
		if (ok) return { lastRenderedPath: currentPath || '' }
	}

	const fragment = document.createDocumentFragment()
	visibleItems.forEach(item => {
		const li = document.createElement('li')
		li.setAttribute('data-path', item.path)
		li.className = `tree-item rounded px-2 py-1 text-sm truncate ${item.isFile ? 'cursor-pointer' : 'cursor-default'}`
		li.style.paddingLeft = `${item.depth * 14 + 8}px`
		if (item.isActive) li.classList.add('bg-primary', 'text-primary-content')
		else li.classList.add('opacity-70')
		if (!item.isFile) li.classList.add('font-semibold')
		if (item.isDraft) li.classList.add('italic')
		li.title = item.path
		if (item.isFile) li.textContent = item.name
		else {
			const folded = collapsedDirs.has(item.path)
			li.textContent = `${folded ? '▸' : '▾'} ${item.name}`
			li.classList.add('tree-dir')
		}
		fragment.appendChild(li)
	})
	fileListEl.replaceChildren(fragment)
	uiStore.lastTreeStructureSig = structureSig
	return { lastRenderedPath: currentPath || '' }
}
